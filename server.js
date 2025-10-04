const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = 3000;

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

// Serve HLS files
app.use('/hls', express.static(HLS_OUTPUT_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  startFFmpeg();
});