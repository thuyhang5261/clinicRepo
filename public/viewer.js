const streamPlayer = document.getElementById('streamPlayer');
const offlineMessage = document.getElementById('offlineMessage');
const streamStatus = document.getElementById('streamStatus');
const viewerCount = document.getElementById('viewerCount');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');

let hls;
let retryCount = 0;
const maxRetries = 10;
let isMuted = false;
let isFullscreen = false;
let streamCheckInterval;

async function checkStreamAvailability() {
    try {
        const response = await fetch('/hls/live.m3u8', { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        // Only log error once per session to reduce spam
        if (!window.streamErrorLogged) {
            console.log('Stream unavailable:', error.message);
            window.streamErrorLogged = true;
        }
        return false;
    }
}

function initPlayer() {
  console.log('Initializing HLS player...');
  
  checkStreamAvailability().then(isAvailable => {
    if (!isAvailable) {
      console.log('Stream not available, showing offline message');
      updateStreamStatus(false);
      addChatMessage('System', 'Stream is currently offline. Waiting for stream to start...');
      scheduleStreamCheck();
      return;
    }
    
    // Stream is available, proceed with HLS initialization
    const streamUrl = '/hls/live.m3u8';
    
    if (Hls.isSupported()) {
      // Cleanup previous instance
      if (hls) {
        hls.destroy();
      }
      
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
      
      hls.loadSource(streamUrl);
      hls.attachMedia(streamPlayer);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest loaded');
        streamPlayer.play().catch(err => {
          console.log('Autoplay prevented:', err);
        });
        updateStreamStatus(true);
        retryCount = 0;
        addChatMessage('System', 'Connected to live stream!');
        clearStreamCheck();
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data);
        if (data.fatal) {
          updateStreamStatus(false);
          if (data.details === 'manifestLoadError') {
            addChatMessage('System', 'Stream ended or temporarily unavailable');
          } else {
            addChatMessage('System', 'Connection lost, retrying...');
          }
          retryConnection();
        }
      });
      
      hls.on(Hls.Events.FRAG_LOADED, () => {
        updateStreamStatus(true);
      });
      
    } else if (streamPlayer.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari fallback
      streamPlayer.src = streamUrl;
      streamPlayer.addEventListener('loadedmetadata', () => {
        streamPlayer.play();
        updateStreamStatus(true);
        clearStreamCheck();
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
  }).catch(error => {
    console.error('Error initializing player:', error);
    showOfflineMessage();
  });
}

function scheduleStreamCheck() {
  clearStreamCheck();
  // Check less frequently to reduce console spam
  streamCheckInterval = setInterval(async () => {
    const isAvailable = await checkStreamAvailability();
    if (isAvailable && !isStreamPlaying()) {
      clearInterval(streamCheckInterval);
      window.streamErrorLogged = false; // Reset error logging
      initPlayer();
    }
  }, 10000); // Check every 10 seconds instead of more frequently
}

function clearStreamCheck() {
  if (streamCheckInterval) {
    clearInterval(streamCheckInterval);
    streamCheckInterval = null;
  }
}

function retryConnection() {
  if (retryCount < maxRetries) {
    retryCount++;
    console.log(`Retrying connection... (${retryCount}/${maxRetries})`);
    setTimeout(() => {
      initPlayer();
    }, 3000 * retryCount);
  } else {
    console.log('Max retries reached, switching to periodic checks');
    updateStreamStatus(false);
    addChatMessage('System', 'Stream is offline. Will automatically reconnect when available.');
    scheduleStreamCheck();
    retryCount = 0; // Reset for next attempt
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
  addChatMessage('System', 'Checking for live stream...');
  setTimeout(initPlayer, 1000);
});

// Cleanup
window.addEventListener('beforeunload', () => {
  clearStreamCheck();
  if (hls) {
    hls.destroy();
  }
});

