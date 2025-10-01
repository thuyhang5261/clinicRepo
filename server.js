const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const cors = require('cors');
const NodeMediaServer = require('node-media-server');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();

// Middleware with updated CORS for HTTPS
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc)
    if (!origin) return callback(null, true);
    
    // Allow any origin for development
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Create HTTP server
const server = http.createServer(app);

// HTTPS Configuration (optional - for development)
let httpsServer = null;
try {
  // Check if SSL certificates exist (you'll need to create these)
  const privateKey = fs.readFileSync(path.join(__dirname, 'ssl/private.key'), 'utf8');
  const certificate = fs.readFileSync(path.join(__dirname, 'ssl/certificate.crt'), 'utf8');
  const credentials = { key: privateKey, cert: certificate };
  
  httpsServer = https.createServer(credentials, app);
} catch (error) {
  console.log('SSL certificates not found. HTTPS server not started.');
  console.log('To enable HTTPS, create ssl/private.key and ssl/certificate.crt files.');
}

// Socket.IO setup for both HTTP and HTTPS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// If HTTPS server exists, attach socket.io to it as well
if (httpsServer) {
  const ioHttps = socketIo(httpsServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    }
  });
  
  // Share the same event handlers
  ioHttps.on('connection', handleSocketConnection);
}

// Chat storage
let chatMessages = [];
let connectedUsers = 0;
let streamStatus = 'offline';

// Extract socket connection handler to reuse for both HTTP and HTTPS
function handleSocketConnection(socket) {
  connectedUsers++;
  console.log(`User connected. Total users: ${connectedUsers}`);
  console.log(`Socket ID: ${socket.id}`);
  
  // Send existing messages to new user
  socket.emit('chat_history', chatMessages);
  
  // Broadcast user count and stream status
  io.emit('user_count', connectedUsers);
  socket.emit('stream_status', { status: streamStatus });
  
  // Handle chat messages
  socket.on('chat_message', (data) => {
    const message = {
      id: Date.now(),
      username: data.username || 'Guest',
      message: data.message,
      timestamp: new Date().toISOString(),
      type: data.type || 'guest'
    };
    
    chatMessages.push(message);
    
    // Keep only last 100 messages
    if (chatMessages.length > 100) {
      chatMessages = chatMessages.slice(-100);
    }
    
    // Broadcast to all clients
    io.emit('chat_message', message);
  });
  
  // Handle heart/reactions
  socket.on('send_heart', (data) => {
    io.emit('heart_animation', {
      username: data.username || 'Guest',
      timestamp: new Date().toISOString()
    });
  });
  
  // Handle stream status changes
  socket.on('stream_status', (data) => {
    streamStatus = data.status;
    io.emit('stream_status', data);
    console.log(`Stream status changed to: ${streamStatus}`);
  });
  
  // Handle chat clear from admin
  socket.on('clear_chat', () => {
    chatMessages = [];
    io.emit('chat_cleared');
    console.log('Chat cleared by admin');
  });
  
  // Handle RTMP data from browser
  socket.on('rtmp_data', (data) => {
    try {
      const flvBuffer = Buffer.from(data.data);
      
      // Write FLV data to a file that can be picked up by the media server
      const tempFile = path.join(__dirname, 'temp', `stream_${Date.now()}.flv`);
      
      // Ensure temp directory exists
      if (!fs.existsSync(path.join(__dirname, 'temp'))) {
        fs.mkdirSync(path.join(__dirname, 'temp'));
      }
      
      fs.writeFileSync(tempFile, flvBuffer);
      
      // Use FFmpeg to push to RTMP
      const ffmpeg = spawn('ffmpeg', [
        '-re',
        '-i', tempFile,
        '-c', 'copy',
        '-f', 'flv',
        'rtmp://14.225.220.70:1935/live/stream'
      ]);

      ffmpeg.on('close', (code) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (err) {
          console.error('Error cleaning up temp file:', err);
        }
      });

    } catch (error) {
      console.error('Error processing RTMP data:', error);
    }
  });
  
  // WebRTC Signaling
  socket.on('join-room', (roomId, userType) => {
    socket.join(roomId);
    socket.userType = userType;
    console.log(`${userType} joined room: ${roomId}`);
    
    // Notify others in room
    socket.to(roomId).emit('user-connected', socket.id, userType);
  });

  socket.on('admin-going-live', (roomId) => {
    // Notify all viewers in room that admin is going live
    socket.to(roomId).emit('admin-live', socket.id);
  });

  socket.on('offer', (offer, roomId, targetId) => {
    socket.to(targetId).emit('offer', offer, socket.id);
  });

  socket.on('answer', (answer, roomId, targetId) => {
    socket.to(targetId).emit('answer', answer, socket.id);
  });

  socket.on('ice-candidate', (candidate, roomId, targetId) => {
    socket.to(targetId).emit('ice-candidate', candidate, socket.id);
  });
  
  socket.on('disconnect', () => {
    connectedUsers--;
    console.log(`User disconnected. Total users: ${connectedUsers}`);
    io.emit('user_count', connectedUsers);
    
    // Notify others in room about disconnection
    socket.broadcast.emit('user-disconnected', socket.id);
  });
}

// Socket.IO for real-time chat
io.on('connection', handleSocketConnection);

// Node Media Server configuration for RTMP
const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*'
  }
};

const nms = new NodeMediaServer(config);
nms.run();

// API endpoints
app.get('/api/stream/status', (req, res) => {
  res.json({
    status: streamStatus,
    viewers: connectedUsers,
    uptime: process.uptime()
  });
});

app.get('/api/chat/messages', (req, res) => {
  res.json(chatMessages);
});

app.post('/api/chat/clear', (req, res) => {
  chatMessages = [];
  io.emit('chat_cleared');
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

server.listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
  console.log(`RTMP Server running on port 1935`);
  console.log(`HTTP Media Server running on port 8000`);
  console.log(`\nAccess URLs:`);
  console.log(`Local: http://localhost:${PORT}/`);
  console.log(`Network: http://14.225.220.70:${PORT}/`);
  console.log(`Admin Panel: http://14.225.220.70:${PORT}/admin`);
  
  if (httpsServer) {
    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`\nHTTPS Server running on port ${HTTPS_PORT}`);
      console.log(`Secure Admin Panel: https://14.225.220.70:${HTTPS_PORT}/admin`);
    });
  } else {
    console.log(`\n  HTTPS not enabled. Camera access will only work on localhost.`);
    console.log(`To enable HTTPS for network access:`);
    console.log(`1. Create ssl/ directory`);
    console.log(`2. Generate self-signed certificates:`);
    console.log(`   openssl req -x509 -newkey rsa:4096 -keyout ssl/private.key -out ssl/certificate.crt -days 365 -nodes`);
  }
});
