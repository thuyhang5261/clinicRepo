let localStream = null;
let ws = null;
let isStreaming = false;
let isCameraActive = false;
let isMuted = false;
let facingMode = 'user';

const videoElement = document.getElementById('videoElement');
const processCanvas = document.getElementById('processCanvas');
const ctx = processCanvas.getContext('2d');
const statusIndicator = document.getElementById('statusIndicator');

// WebSocket connection
function connectWebSocket() {
  // Use localhost for development, production domain for production
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  let wsUrl;
  if (isDevelopment) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl = `${protocol}//${window.location.host}`;
  } else {
    // For production, use the production WebSocket URL
    wsUrl = `wss://phongkhamhongnhan.com/`;
  }
  
  console.log('Connecting to WebSocket:', wsUrl);
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('WebSocket connected');
    updateStatus('Connected - Ready to stream', 'success');
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected');
    updateStatus('Disconnected - Reconnecting...', 'error');
    setTimeout(connectWebSocket, 3000);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    updateStatus('Connection error', 'error');
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('Received:', data);
      
      switch(data.type) {
        case 'connected':
          updateStatus('WebSocket connected - Ready to stream', 'success');
          break;
        case 'stream-started':
          updateStatus('🔴 STREAMING LIVE to VPS', 'streaming');
          isStreaming = true;
          updateStreamButton();
          break;
        case 'stream-stopped':
          updateStatus('Stream stopped', 'warning');
          isStreaming = false;
          updateStreamButton();
          break;
        case 'pong':
          console.log('Received pong from server');
          break;
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };
}

// Camera controls
async function startCamera() {
  try {
    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: facingMode,
        frameRate: { ideal: 30 }
      },
      audio: true
    };
    
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = localStream;
    isCameraActive = true;
    
    document.getElementById('cameraBtn').classList.add('active');
    updateStatus('Camera active - Ready to go live', 'success');
  } catch (err) {
    console.error('Camera error:', err);
    updateStatus('Camera access denied', 'error');
    alert('Camera access required for streaming. Please allow camera access and try again.');
  }
}

function stopCamera() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    videoElement.srcObject = null;
    localStream = null;
    isCameraActive = false;
    
    document.getElementById('cameraBtn').classList.remove('active');
    updateStatus('Camera stopped', 'warning');
  }
}

// Streaming controls
function startStreaming() {
  if (!isCameraActive) {
    alert('Please start camera first');
    return;
  }
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'start-stream' }));
    isStreaming = true;
    updateStreamButton();
    updateStatus('🔴 LIVE - Streaming to phongkhamhongnhan.com', 'streaming');
    
    // Start capturing and sending frames
    captureAndSendFrames();
  } else {
    alert('Connection to server lost. Please refresh the page.');
  }
}

function stopStreaming() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'stop-stream' }));
  }
  
  isStreaming = false;
  updateStreamButton();
  updateStatus('Stream ended', 'warning');
}

// Update stream button appearance
function updateStreamButton() {
  const liveBtn = document.getElementById('liveBtn');
  if (isStreaming) {
    liveBtn.classList.add('streaming');
    liveBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Live';
  } else {
    liveBtn.classList.remove('streaming');
    liveBtn.innerHTML = '<i class="fas fa-broadcast-tower"></i> Go Live';
  }
}

// Capture and send video frames
function captureAndSendFrames() {
  if (!isStreaming) return;
  
  // Draw current video frame to canvas
  ctx.drawImage(videoElement, 0, 0, processCanvas.width, processCanvas.height);
  
  // Convert to JPEG blob for better compression
  processCanvas.toBlob((blob) => {
    if (blob && ws && ws.readyState === WebSocket.OPEN) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        ws.send(JSON.stringify({
          type: 'video-data',
          data: base64data,
          timestamp: Date.now()
        }));
      };
      reader.readAsDataURL(blob);
    }
    
    if (isStreaming) {
      setTimeout(captureAndSendFrames, 100); // 10 FPS for better performance
    }
  }, 'image/jpeg', 0.7);
}

// UI controls
function flipCamera() {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  if (isCameraActive) {
    stopCamera();
    setTimeout(startCamera, 500);
  }
}

function toggleMute() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      isMuted = !audioTrack.enabled;
      
      const voiceBtn = document.getElementById('voiceBtn');
      if (isMuted) {
        voiceBtn.classList.add('muted');
        voiceBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Muted';
      } else {
        voiceBtn.classList.remove('muted');
        voiceBtn.innerHTML = '<i class="fas fa-microphone"></i> Voice';
      }
    }
  }
}

function updateStatus(message, type) {
  statusIndicator.innerHTML = `<i class="fas fa-video me-1"></i>${message}`;
  statusIndicator.className = 'status-indicator ' + type;
}

function expandWindow() {
  const window = document.getElementById('livestreamWindow');
  window.classList.toggle('expanded');
  
  const expandBtn = document.getElementById('expandBtn');
  const icon = expandBtn.querySelector('i');
  
  if (window.classList.contains('expanded')) {
    icon.className = 'fas fa-compress';
    expandBtn.title = 'Minimize';
  } else {
    icon.className = 'fas fa-expand';
    expandBtn.title = 'Expand';
  }
}

// Event listeners
document.getElementById('cameraBtn').addEventListener('click', () => {
  if (isCameraActive) {
    stopCamera();
  } else {
    startCamera();
  }
});

document.getElementById('flipBtn').addEventListener('click', flipCamera);

document.getElementById('liveBtn').addEventListener('click', () => {
  if (isStreaming) {
    stopStreaming();
  } else {
    startStreaming();
  }
});

document.getElementById('voiceBtn').addEventListener('click', toggleMute);

document.getElementById('expandBtn').addEventListener('click', expandWindow);

document.getElementById('closeBtn').addEventListener('click', () => {
  if (isStreaming) stopStreaming();
  if (isCameraActive) stopCamera();
});

// WebSocket keepalive
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000); // Send ping every 30 seconds

// Initialize connection when page loads
document.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
  updateStatus('Click camera to start', 'info');
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (isStreaming) stopStreaming();
  if (isCameraActive) stopCamera();
  if (ws) ws.close();
});
