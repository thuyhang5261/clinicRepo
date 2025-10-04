const WebSocket = require('ws');
const { spawn } = require('child_process');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/live' });

let viewerCount = 0;
let ffmpegProcess = null;

app.use(express.json());

// API endpoints
app.get('/api/viewers', (req, res) => {
    res.json({ count: viewerCount });
});

app.post('/api/heart', (req, res) => {
    console.log('Heart received at', new Date());
    res.json({ success: true });
});

// WebSocket handler
wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    viewerCount++;
    
    // Start FFmpeg process for this connection
    ffmpegProcess = spawn('ffmpeg', [
        '-f', 'webm',
        '-i', 'pipe:0',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-c:a', 'aac',
        '-ar', '44100',
        '-b:a', '128k',
        '-f', 'flv',
        process.env.RTMP_URL || 'rtmp://nginx-rtmp:1935/live/stream'
    ]);

    ffmpegProcess.on('error', (error) => {
        console.error('FFmpeg error:', error);
    });

    ffmpegProcess.stderr.on('data', (data) => {
        console.log('FFmpeg:', data.toString());
    });

    ws.on('message', (data) => {
        if (ffmpegProcess && !ffmpegProcess.killed) {
            ffmpegProcess.stdin.write(data);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket disconnected');
        viewerCount--;
        
        if (ffmpegProcess && !ffmpegProcess.killed) {
            ffmpegProcess.stdin.end();
            ffmpegProcess.kill();
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

server.listen(3000, () => {
    console.log('Stream processor listening on port 3000');
});
