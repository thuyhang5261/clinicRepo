const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const RTMP_URL = 'rtmp://14.225.220.70:1935/live/phongkhamhongnhan';

let ffmpegProcess = null;
let isStreaming = false;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// WebSocket handling
wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'start-stream') {
        startFFmpeg();
        ws.send(JSON.stringify({ type: 'stream-started' }));
      } else if (data.type === 'stop-stream') {
        stopFFmpeg();
        ws.send(JSON.stringify({ type: 'stream-stopped' }));
      } else if (data.type === 'video-data' && isStreaming && ffmpegProcess) {
        // Write JPEG binary data to FFmpeg stdin
        const buffer = Buffer.from(data.data, 'base64');
        if (ffmpegProcess.stdin.writable) {
          ffmpegProcess.stdin.write(buffer);
        }
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    stopFFmpeg();
  });
});

function startFFmpeg() {
  if (ffmpegProcess) return;

  console.log('Starting FFmpeg process...');
  
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
    '-f', 'flv',
    RTMP_URL
  ]);

  ffmpegProcess.stdout.on('data', (data) => {
    console.log(`FFmpeg stdout: ${data}`);
  });

  ffmpegProcess.stderr.on('data', (data) => {
    console.log(`FFmpeg stderr: ${data}`);
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`FFmpeg process exited with code ${code}`);
    ffmpegProcess = null;
    isStreaming = false;
  });

  isStreaming = true;
}

function stopFFmpeg() {
  if (ffmpegProcess) {
    console.log('Stopping FFmpeg process...');
    ffmpegProcess.stdin.end();
    ffmpegProcess.kill('SIGTERM');
    ffmpegProcess = null;
    isStreaming = false;
  }
}

// Start server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
