const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = 3000;

// Set security headers including CSP
app.use((req, res, next) => {
  // Content Security Policy - Allow connections for DevTools and development
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
    "font-src 'self' https://cdnjs.cloudflare.com; " +
    "img-src 'self' data: https:; " +
    "media-src 'self' blob:; " +
    "worker-src 'self' blob:; " +
    "connect-src 'self' ws://localhost:* http://localhost:* https://localhost:* ws://127.0.0.1:* http://127.0.0.1:* https://127.0.0.1:* wss://phongkhamhongnhan.com ws://phongkhamhongnhan.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
    "frame-src 'none'; " +
    "object-src 'none'; " +
    "base-uri 'self';"
  );
  
  // Other security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  next();
});

const RTMP_URL = 'rtmp://14.225.220.70:1935/live/phongkhamhongnhan';
const HLS_OUTPUT_DIR = path.join(__dirname, 'public', 'hls');

// Tạo thư mục HLS nếu chưa có
const fs = require('fs');
if (!fs.existsSync(HLS_OUTPUT_DIR)) {
  fs.mkdirSync(HLS_OUTPUT_DIR, { recursive: true });
}

let ffmpegProcess;
let connectedClients = new Set();

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('New WebSocket client connected from:', req.socket.remoteAddress);
  connectedClients.add(ws);
  
  // Send connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket connection established',
    timestamp: new Date().toISOString()
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received WebSocket message:', data);
      
      switch(data.type) {
        case 'start-stream':
          if (!isStreaming) {
            startFFmpeg();
            broadcastToClients({
              type: 'stream-started',
              message: 'Live stream started',
              timestamp: new Date().toISOString()
            });
          }
          break;
          
        case 'stop-stream':
          if (isStreaming && ffmpegProcess) {
            ffmpegProcess.kill('SIGTERM');
            broadcastToClients({
              type: 'stream-stopped',
              message: 'Live stream stopped',
              timestamp: new Date().toISOString()
            });
          }
          break;
          
        case 'video-data':
          // Handle video frame data from admin client
          if (ffmpegProcess && ffmpegProcess.stdin && !ffmpegProcess.stdin.destroyed) {
            try {
              // Decode base64 image and write to FFmpeg stdin
              const imageBuffer = Buffer.from(data.data, 'base64');
              ffmpegProcess.stdin.write(imageBuffer);
              
              // Log occasionally to track video data flow
              if (Date.now() % 1000 < 100) { // Log roughly every second
                console.log(`Video frame received: ${Math.round(imageBuffer.length / 1024)}KB`);
              }
            } catch (error) {
              console.error('Error writing video data to FFmpeg:', error);
            }
          } else {
            console.log('FFmpeg process not ready for video data');
          }
          break;
          
        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
          break;
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    connectedClients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    connectedClients.delete(ws);
  });
});

// Broadcast message to all connected clients
function broadcastToClients(message) {
  const messageStr = JSON.stringify(message);
  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

let isStreaming = false;

function startFFmpeg() {
  if (ffmpegProcess) {
    console.log('FFmpeg process already running');
    return;
  }

  console.log('Starting FFmpeg process...');
  isStreaming = true;
  
  // FFmpeg to create HLS output from image pipe (admin camera feed)
  ffmpegProcess = spawn('ffmpeg', [
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-r', '10',                    // 10 FPS input
    '-i', 'pipe:0',               // Read from stdin
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-g', '20',                   // GOP size
    '-b:v', '1500k',
    '-maxrate', '1500k',
    '-bufsize', '3000k',
    '-f', 'hls',
    '-hls_time', '2',             // 2 second segments
    '-hls_list_size', '5',        // Keep 5 segments in playlist
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_filename', path.join(HLS_OUTPUT_DIR, 'segment%03d.ts'),
    path.join(HLS_OUTPUT_DIR, 'live.m3u8')
  ]);

  ffmpegProcess.stdout.on('data', (data) => {
    console.log(`FFmpeg stdout: ${data}`);
  });

  ffmpegProcess.stderr.on('data', (data) => {
    // Only log important FFmpeg messages to reduce noise
    const message = data.toString();
    if (message.includes('frame=') || message.includes('time=')) {
      // These are normal progress messages, don't log them
      return;
    }
    console.error(`FFmpeg stderr: ${data}`);
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`FFmpeg process exited with code ${code}`);
    isStreaming = false;
    ffmpegProcess = null;
    
    // Clean up HLS files when stream stops
    try {
      const files = fs.readdirSync(HLS_OUTPUT_DIR);
      files.forEach(file => {
        if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
          fs.unlinkSync(path.join(HLS_OUTPUT_DIR, file));
        }
      });
    } catch (err) {
      console.error('Error cleaning up HLS files:', err);
    }
    
    // Notify clients that stream stopped
    broadcastToClients({
      type: 'stream-stopped',
      message: 'FFmpeg process stopped',
      code: code,
      timestamp: new Date().toISOString()
    });
  });

  ffmpegProcess.on('error', (error) => {
    console.error('FFmpeg process error:', error);
    isStreaming = false;
    ffmpegProcess = null;
  });
}

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve HLS files with CORS headers
app.use('/hls', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD');
  res.header('Access-Control-Allow-Headers', 'Range');
  res.header('Accept-Ranges', 'bytes');
  next();
}, express.static(HLS_OUTPUT_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Admin panel route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// DevTools debugging endpoint (for development)
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.json({
    "devtools_frontend_url": `chrome-devtools://devtools/bundled/inspector.html?ws=localhost:9229`,
    "description": "Clinic App",
    "faviconUrl": "http://localhost:3000/favicon.ico",
    "id": "clinic-app",
    "title": "Clinic Live Stream App",
    "type": "node",
    "url": "http://localhost:3000/",
    "webSocketDebuggerUrl": `ws://localhost:9229`
  });
});

// Serve favicon
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.ico'), (err) => {
        if (err) {
            res.status(404).end();
        }
    });
});

// HLS stream endpoints
app.head('/hls/live.m3u8', (req, res) => {
    const playlistPath = path.join(HLS_OUTPUT_DIR, 'live.m3u8');
    if (fs.existsSync(playlistPath)) {
        res.status(200).end();
    } else {
        res.status(404).end();
    }
});

app.get('/hls/live.m3u8', (req, res) => {
    const playlistPath = path.join(HLS_OUTPUT_DIR, 'live.m3u8');
    
    // Check if real HLS playlist exists
    if (fs.existsSync(playlistPath)) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(playlistPath);
    } else {
        // Return 404 if no real stream is available
        res.status(404).json({
            error: 'Stream not available',
            message: 'No active stream found'
        });
    }
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  console.log(`Viewer: http://localhost:${PORT}/`);
  // Don't start FFmpeg automatically - wait for admin to start streaming
});