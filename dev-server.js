const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = 3000;

// Development mode - more permissive CSP for debugging
app.use((req, res, next) => {
  // Very permissive CSP for development and debugging
  res.setHeader('Content-Security-Policy', 
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: http: https:; " +
    "connect-src 'self' 'unsafe-inline' ws: wss: http: https:; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:; " +
    "style-src 'self' 'unsafe-inline' https: http:; " +
    "img-src 'self' data: blob: https: http:; " +
    "media-src 'self' blob: https: http:; " +
    "font-src 'self' data: https: http:;"
  );
  
  // Allow all origins for development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
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

function startFFmpeg() {
  if (ffmpegProcess) return;

  console.log('Starting FFmpeg process...');
  
  // FFmpeg để tạo cả RTMP và HLS output
  ffmpegProcess = spawn('ffmpeg', [
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-r', '10',
    '-i', 'pipe:0',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-g', '20',
    '-b:v', '1500k',
    '-maxrate', '1500k',
    '-bufsize', '3000k',
    // HLS output
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '3',
    '-hls_flags', 'delete_segments',
    path.join(HLS_OUTPUT_DIR, 'live.m3u8'),
    // RTMP output (nếu vẫn cần)
    '-f', 'flv',
    RTMP_URL
  ]);

  ffmpegProcess.stdout.on('data', (data) => {
    console.log(`FFmpeg stdout: ${data}`);
  });

  ffmpegProcess.stderr.on('data', (data) => {
    console.error(`FFmpeg stderr: ${data}`);
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`FFmpeg process exited with code ${code}`);
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
    "description": "Clinic App - Development",
    "faviconUrl": "http://localhost:3000/favicon.ico",
    "id": "clinic-app-dev",
    "title": "Clinic Live Stream App (Development)",
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
    // For development, return 200 with a mock stream
    res.status(200).end();
});

app.get('/hls/live.m3u8', (req, res) => {
    // Basic HLS playlist for testing
    const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:10.0,
segment0.ts
#EXT-X-ENDLIST`;
    
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(playlist);
});

app.listen(PORT, () => {
  console.log(`🚀 Development server is running on http://localhost:${PORT}`);
  console.log(`🔧 Debugger available at chrome://inspect`);
  console.log(`📊 DevTools endpoint: http://localhost:${PORT}/.well-known/appspecific/com.chrome.devtools.json`);
  startFFmpeg();
});