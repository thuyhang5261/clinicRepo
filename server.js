const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const NodeMediaServer = require('node-media-server');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Remove FLV proxy middleware and replace with HLS
app.use('/live', express.static(path.join(__dirname, 'media/live')));

// CORS for OPTIONS requests
app.options('/live/stream.flv', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Range, Accept');
  res.sendStatus(200);
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve viewer page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/watch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Chat + Socket.IO with WebRTC support
let chatMessages = [];
let connectedUsers = 0;
let streamStatus = 'offline';
let rooms = {}; // Store room information
let currentLiveAdmin = null; // Track the currently live admin

io.on('connection', (socket) => {
  connectedUsers++;
  console.log(`User connected. Total users: ${connectedUsers}`);

  socket.emit('chat_history', chatMessages);
  io.emit('user_count', connectedUsers);
  io.emit('stream_status', { status: streamStatus });

  // WebRTC Room Management with single admin enforcement
  socket.on('join-room', (roomId, userType) => {
    socket.join(roomId);
    socket.userType = userType;
    socket.roomId = roomId;
    
    if (!rooms[roomId]) {
      rooms[roomId] = { admin: null, viewers: [] };
    }
    
    if (userType === 'admin') {
      // Check if there's already a live admin
      if (currentLiveAdmin && currentLiveAdmin !== socket.id) {
        console.log(`Disconnecting previous live admin: ${currentLiveAdmin}`);
        // Notify the old admin that they're being replaced
        io.to(currentLiveAdmin).emit('admin-replaced', {
          message: 'Another admin has started streaming. You have been disconnected.',
          newAdminId: socket.id
        });
        // Force disconnect the old admin
        io.sockets.sockets.get(currentLiveAdmin)?.disconnect(true);
      }
      
      rooms[roomId].admin = socket.id;
      currentLiveAdmin = socket.id;
      console.log(`Admin joined room ${roomId}. Current live admin: ${socket.id}`);
      
      // Notify all viewers about new admin
      rooms[roomId].viewers.forEach(viewerId => {
        io.to(viewerId).emit('new-admin-connected', socket.id);
      });
    } else {
      // Remove any viewer limit - allow unlimited viewers
      rooms[roomId].viewers.push(socket.id);
      console.log(`Viewer joined room ${roomId}. Total viewers: ${rooms[roomId].viewers.length}`);
      
      // Notify admin that a viewer connected (no limit check)
      if (rooms[roomId].admin) {
        io.to(rooms[roomId].admin).emit('user-connected', socket.id, userType);
      }
    }
  });

  // WebRTC Signaling
  socket.on('offer', (offer, roomId, targetUserId) => {
    console.log('Relaying offer from', socket.id, 'to', targetUserId);
    io.to(targetUserId).emit('offer', offer, socket.id);
  });

  socket.on('answer', (answer, roomId, targetUserId) => {
    console.log('Relaying answer from', socket.id, 'to', targetUserId);
    io.to(targetUserId).emit('answer', answer, socket.id);
  });

  socket.on('ice-candidate', (candidate, roomId, targetUserId) => {
    console.log('Relaying ICE candidate from', socket.id, 'to', targetUserId);
    console.log('ICE Candidate type:', candidate.candidate ? candidate.candidate.split(' ')[7] : 'null');
    io.to(targetUserId).emit('ice-candidate', candidate, socket.id);
  });

  // Admin events - enhanced with single admin enforcement
  socket.on('admin-going-live', (roomId) => {
    console.log(`Admin ${socket.id} going live in room ${roomId}`);
    
    // Verify this is the current live admin
    if (currentLiveAdmin && currentLiveAdmin !== socket.id) {
      console.log(`Rejecting stream from ${socket.id} - another admin is already live: ${currentLiveAdmin}`);
      socket.emit('stream-rejected', {
        message: 'Another admin is currently streaming. Only one admin can stream at a time.',
        currentLiveAdmin: currentLiveAdmin
      });
      return;
    }
    
    // Set as current live admin
    currentLiveAdmin = socket.id;
    streamStatus = 'live';
    
    if (rooms[roomId]) {
      console.log(`Broadcasting to ${rooms[roomId].viewers.length} viewers from admin: ${socket.id}`);
      rooms[roomId].viewers.forEach(viewerId => {
        io.to(viewerId).emit('admin-going-live');
      });
    }
    
    // Broadcast to all connected clients
    io.emit('stream_status', { 
      status: 'live', 
      adminId: socket.id,
      message: 'Stream started by admin'
    });
  });

  // Enhanced stream status handling
  socket.on('stream_status', (data) => {
    // Only allow the current live admin to change stream status
    if (data.status === 'live') {
      if (currentLiveAdmin && currentLiveAdmin !== socket.id) {
        console.log(`Stream start rejected for ${socket.id} - admin ${currentLiveAdmin} is already live`);
        socket.emit('stream-rejected', {
          message: 'Another admin is currently streaming. Please wait for them to finish.',
          currentLiveAdmin: currentLiveAdmin
        });
        return;
      }
      currentLiveAdmin = socket.id;
      console.log(`Admin ${socket.id} started streaming`);
    } else if (data.status === 'offline') {
      if (currentLiveAdmin === socket.id) {
        currentLiveAdmin = null;
        console.log(`Admin ${socket.id} stopped streaming`);
      }
    }
    
    streamStatus = data.status;
    io.emit('stream_status', {
      ...data,
      adminId: currentLiveAdmin
    });
  });

  socket.on('chat_message', (data) => {
    const message = {
      id: Date.now(),
      username: data.username || 'Guest',
      message: data.message,
      timestamp: new Date().toISOString(),
      type: data.type || 'guest'
    };

    chatMessages.push(message);
    if (chatMessages.length > 100) chatMessages = chatMessages.slice(-100);

    io.emit('chat_message', message);
  });

  socket.on('send_heart', (data) => {
    io.emit('heart_animation', {
      username: data.username || 'Guest',
      timestamp: new Date().toISOString()
    });
  });

  socket.on('clear_chat', () => {
    chatMessages = [];
    io.emit('chat_cleared');
  });

  socket.on('disconnect', () => {
    connectedUsers--;
    
    // Handle admin disconnection
    if (socket.userType === 'admin' && currentLiveAdmin === socket.id) {
      console.log(`Live admin ${socket.id} disconnected - clearing live status`);
      currentLiveAdmin = null;
      streamStatus = 'offline';
      
      // Notify all clients that the stream ended
      io.emit('stream_status', { 
        status: 'offline', 
        message: 'Admin disconnected - stream ended',
        adminId: null 
      });
    }
    
    // Handle room cleanup
    if (socket.roomId && rooms[socket.roomId]) {
      if (socket.userType === 'admin') {
        // Admin disconnected - notify all viewers
        rooms[socket.roomId].viewers.forEach(viewerId => {
          io.to(viewerId).emit('user-disconnected', socket.id);
        });
        rooms[socket.roomId].admin = null;
        
        // Clear current live admin if it was this admin
        if (currentLiveAdmin === socket.id) {
          currentLiveAdmin = null;
        }
      } else {
        // Viewer disconnected - notify admin
        const room = rooms[socket.roomId];
        room.viewers = room.viewers.filter(id => id !== socket.id);
        if (room.admin) {
          io.to(room.admin).emit('user-disconnected', socket.id);
        }
      }
    }
    
    io.emit('user_count', connectedUsers);
    socket.broadcast.emit('user-disconnected', socket.id);
    console.log(`User disconnected. Total users: ${connectedUsers}`);
  });

  // Enhanced WebRTC handling with admin verification
  socket.on('request-webrtc-stream', (roomId) => {
    console.log('WebRTC stream requested by', socket.id, 'for room', roomId);
    if (rooms[roomId] && rooms[roomId].admin && rooms[roomId].admin === currentLiveAdmin) {
      // Only allow WebRTC requests to the current live admin
      io.to(rooms[roomId].admin).emit('webrtc-viewer-request', socket.id);
      console.log(`WebRTC connection requested to current live admin. Current viewers: ${rooms[roomId].viewers.length}`);
    } else {
      socket.emit('no-live-admin', {
        message: 'No admin is currently streaming',
        currentLiveAdmin: currentLiveAdmin
      });
    }
  });

  // Network quality monitoring for mobile optimization
  socket.on('network-quality', (quality) => {
    // Log network quality for monitoring (could be stored/analyzed)
    console.log(`Network quality from ${socket.id}:`, quality);
  });
});

// Add HLS stream check endpoint
app.get('/api/stream/check', async (req, res) => {
  try {
    // Check if HLS playlist exists
    const hlsPath = path.join(__dirname, 'media/live/stream/index.m3u8');
    const hlsExists = fs.existsSync(hlsPath);
    
    res.json({
      status: streamStatus,
      hlsAvailable: hlsExists,
      viewers: connectedUsers,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      status: 'error',
      hlsAvailable: false,
      viewers: connectedUsers,
      error: error.message
    });
  }
});

// Node Media Server with HLS enabled - optimized for unlimited viewers
const config = {
  rtmp: {
    port: process.env.RTMP_PORT || 1936,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
    allow_origin: '*'
  },
  http: {
    port: process.env.HTTP_MEDIA_PORT || 8000,
    bind: '103.200.23.120',
    allow_origin: '*',
    mediaroot: './media',
    api: true
  },
  hls: {
    port: process.env.HLS_PORT || 8001,
    mediaroot: './media',
    allow_origin: '*'
  },
  relay: {
    hls: true,
    hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]'
  }
};

// Create media directory if it doesn't exist
const mediaDir = path.join(__dirname, 'media');
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
  console.log('Created media directory:', mediaDir);
}

const nms = new NodeMediaServer(config);

nms.on('preConnect', (id, args) => {
  console.log('[NodeMediaServer] Stream connecting:', id, args);
});

nms.on('postConnect', (id, args) => {
  console.log('[NodeMediaServer] Stream connected:', id);
  streamStatus = 'live';
  io.emit('stream_status', { status: streamStatus });
});

nms.on('doneConnect', (id, args) => {
  console.log('[NodeMediaServer] Stream disconnected:', id);
  streamStatus = 'offline';
  io.emit('stream_status', { status: streamStatus });
});

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[NodeMediaServer] Stream publish started:', StreamPath);
  streamStatus = 'live';
  io.emit('stream_status', { status: streamStatus });
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log('[NodeMediaServer] Stream publish confirmed:', StreamPath);
  streamStatus = 'live';
  io.emit('stream_status', { status: streamStatus });
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[NodeMediaServer] Stream publish ended:', StreamPath);
  streamStatus = 'offline';
  io.emit('stream_status', { status: streamStatus });
});

try {
  nms.run();
  console.log('[NodeMediaServer] Started successfully');
} catch (error) {
  console.error('[NodeMediaServer] Failed to start:', error);
}

// API endpoints
app.get('/api/stream/status', (req, res) => {
  res.json({
    status: streamStatus,
    viewers: connectedUsers,
    uptime: process.uptime(),
    currentLiveAdmin: currentLiveAdmin,
    adminCount: currentLiveAdmin ? 1 : 0
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

// Add STUN/TURN server configuration endpoint
app.get('/api/webrtc/config', (req, res) => {
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // Add more STUN servers for better connectivity
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.nextcloud.com:443' }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };
  
  res.json(rtcConfig);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    streamStatus: streamStatus,
    connectedUsers: connectedUsers,
    ports: {
      main: process.env.PORT || 3000,
      rtmp: process.env.RTMP_PORT || 1936,
      httpMedia: process.env.HTTP_MEDIA_PORT || 8000
    }
  });
});

// Add endpoint to get current live admin info
app.get('/api/admin/current', (req, res) => {
  res.json({
    currentLiveAdmin: currentLiveAdmin,
    isLive: streamStatus === 'live',
    timestamp: new Date().toISOString()
  });
});

// Add endpoint to force disconnect current admin (admin management)
app.post('/api/admin/disconnect', (req, res) => {
  if (currentLiveAdmin) {
    console.log(`Force disconnecting admin: ${currentLiveAdmin}`);
    io.to(currentLiveAdmin).emit('admin-force-disconnect', {
      message: 'You have been disconnected by system administrator'
    });
    io.sockets.sockets.get(currentLiveAdmin)?.disconnect(true);
    currentLiveAdmin = null;
    streamStatus = 'offline';
    
    res.json({ 
      success: true, 
      message: 'Admin disconnected successfully' 
    });
  } else {
    res.json({ 
      success: false, 
      message: 'No admin currently streaming' 
    });
  }
});

// Proxy HLS requests to NodeMediaServer (port 8000)
app.use(
  '/api/stream/proxy',
  createProxyMiddleware({
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
    pathRewrite: {
      '^/api/stream/proxy': '', // Remove /api/stream/proxy from path
    },
    onProxyReq: (proxyReq, req, res) => {
      // Optionally add headers for CORS or logging
      proxyReq.setHeader('Origin', req.headers.origin || '');
    },
    onError: (err, req, res) => {
      res.status(500).send('Proxy error');
    },
  })
);

// ⚡ Passenger sẽ require app, không listen port
if (process.env.PASSENGER_APP_ENV) {
  console.log('Running in Passenger mode');
  module.exports = server;
} else {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '103.200.23.120', () => {
    console.log(`Server running on http://103.200.23.120:${PORT}`);
    console.log(`RTMP Server running on port ${process.env.RTMP_PORT || 1936}`);
    console.log(`HTTP Media Server running on port ${process.env.HTTP_MEDIA_PORT || 8000}`);
    console.log(`Socket.io available at http://103.200.23.120:${PORT}/socket.io/socket.io.js`);
  });
}
// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    streamStatus: streamStatus,
    connectedUsers: connectedUsers,
    ports: {
      main: process.env.PORT || 3000,
      rtmp: process.env.RTMP_PORT || 1936,
      httpMedia: process.env.HTTP_MEDIA_PORT || 8000
    }
  });
});

// ⚡ Passenger sẽ require app, không listen port
if (process.env.PASSENGER_APP_ENV) {
  console.log('Running in Passenger mode');
  module.exports = server;
} else {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`RTMP Server running on port ${process.env.RTMP_PORT || 1936}`);
    console.log(`HTTP Media Server running on port ${process.env.HTTP_MEDIA_PORT || 8000}`);
    console.log(`Socket.io available at http://localhost:${PORT}/socket.io/socket.io.js`);
  });
}
  module.exports = server;
} else {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`RTMP Server running on port ${process.env.RTMP_PORT || 1936}`);
    console.log(`HTTP Media Server running on port ${process.env.HTTP_MEDIA_PORT || 8000}`);
    console.log(`Socket.io available at http://localhost:${PORT}/socket.io/socket.io.js`);
  });
}

