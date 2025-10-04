const streamPlayer = document.getElementById('streamPlayer');
const offlineMessage = document.getElementById('offlineMessage');
const streamStatus = document.getElementById('streamStatus');
const viewerCount = document.getElementById('viewerCount');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');

const HLS_URL = 'https://phongkhamhongnhan.com/hls/live.m3u8';
let hls = null;
let isMuted = true;
let isFullscreen = false;
let retryCount = 0;
const maxRetries = 10;

function initPlayer() {
  console.log('Initializing HLS player...');
  
  if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 5,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 4,
      manifestLoadingRetryDelay: 1000
    });
    
    hls.loadSource(HLS_URL);
    hls.attachMedia(streamPlayer);
    
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('HLS manifest loaded');
      streamPlayer.play().catch(err => {
        console.log('Autoplay prevented:', err);
      });
      updateStreamStatus(true);
      retryCount = 0;
      addChatMessage('System', 'Connected to live stream!');
    });
    
    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('HLS error:', data);
      if (data.fatal) {
        updateStreamStatus(false);
        addChatMessage('System', 'Connection lost, retrying...');
        retryConnection();
      }
    });
    
    hls.on(Hls.Events.FRAG_LOADED, () => {
      updateStreamStatus(true);
    });
    
  } else if (streamPlayer.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari fallback
    streamPlayer.src = HLS_URL;
    streamPlayer.addEventListener('loadedmetadata', () => {
      streamPlayer.play();
      updateStreamStatus(true);
    });
    streamPlayer.addEventListener('error', () => {
      updateStreamStatus(false);
      retryConnection();
    });
  } else {
    console.error('HLS not supported in this browser');
    updateStreamStatus(false);
    addChatMessage('System', 'Your browser does not support live streaming');
  }
}

function retryConnection() {
  if (retryCount < maxRetries) {
    retryCount++;
    console.log(`Retrying connection... (${retryCount}/${maxRetries})`);
    setTimeout(initPlayer, 5000 * retryCount);
  } else {
    console.log('Max retries reached');
    updateStreamStatus(false);
    addChatMessage('System', 'Unable to connect to stream. Please refresh the page.');
  }
}

function updateStreamStatus(isLive) {
  if (isLive) {
    streamStatus.innerHTML = '🔴 LIVE';
    streamStatus.style.color = '#ff4444';
    offlineMessage.style.display = 'none';
    streamPlayer.style.display = 'block';
    
    // Simulate viewer count
    const viewers = Math.floor(Math.random() * 50) + 10;
    viewerCount.innerHTML = `<i class="fas fa-eye me-1"></i>${viewers} viewers`;
  } else {
    streamStatus.innerHTML = '⏹️ OFFLINE';
    streamStatus.style.color = '#999';
    offlineMessage.style.display = 'flex';
    streamPlayer.style.display = 'none';
    viewerCount.innerHTML = '<i class="fas fa-eye me-1"></i>0 viewers';
  }
}

function addChatMessage(sender, message) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';
  messageDiv.innerHTML = `<strong>${sender}:</strong> ${message}`;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendMessage() {
  const message = messageInput.value.trim();
  if (message) {
    addChatMessage('You', message);
    messageInput.value = '';
    
    // Simulate doctor response (in real app, this would be via WebSocket)
    setTimeout(() => {
      const responses = [
        'Thank you for your question.',
        'I understand your concern.',
        'Let me explain that for you.',
        'That\'s a great question.',
        'I\'ll address that shortly.'
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      addChatMessage('Dr. Thắng', randomResponse);
    }, 2000 + Math.random() * 3000);
  }
}

// Event listeners
document.getElementById('refreshBtn').addEventListener('click', () => {
  location.reload();
});

document.getElementById('muteBtn').addEventListener('click', function() {
  isMuted = !isMuted;
  streamPlayer.muted = isMuted;
  this.innerHTML = isMuted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
});

document.getElementById('fullscreenBtn').addEventListener('click', () => {
  if (!isFullscreen) {
    if (streamPlayer.requestFullscreen) {
      streamPlayer.requestFullscreen();
    } else if (streamPlayer.webkitRequestFullscreen) {
      streamPlayer.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
});

document.getElementById('shareBtn').addEventListener('click', () => {
  if (navigator.share) {
    navigator.share({
      title: 'Phòng Khám Hồng Nhận - Live Stream',
      text: 'Watch our live medical consultation',
      url: window.location.href
    });
  } else {
    navigator.clipboard.writeText(window.location.href).then(() => {
      alert('Link copied to clipboard!');
    });
  }
});

document.getElementById('heartBtn').addEventListener('click', function() {
  this.style.transform = 'scale(1.2)';
  setTimeout(() => { this.style.transform = 'scale(1)'; }, 200);
  addChatMessage('You', '❤️ Liked the stream');
});

document.getElementById('sendBtn').addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

// Fullscreen change event
document.addEventListener('fullscreenchange', () => {
  isFullscreen = !isFullscreen;
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  updateStreamStatus(false);
  setTimeout(initPlayer, 1000);
});

// Cleanup
window.addEventListener('beforeunload', () => {
  if (hls) {
    hls.destroy();
  }
});
