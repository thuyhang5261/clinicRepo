class StreamViewer {
    constructor() {
        this.video = document.getElementById('streamPlayer');
        this.statusIndicator = document.getElementById('streamStatus');
        this.offlineMessage = document.getElementById('offlineMessage');
        this.viewerCount = document.getElementById('viewerCount');
        this.hls = null;
        this.streamUrl = 'http://14.225.220.70:8080/hls/stream.m3u8';
        
        this.initializeControls();
        this.initializeHLS();
        this.startPolling();
    }

    initializeControls() {
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshStream());
        document.getElementById('muteBtn').addEventListener('click', () => this.toggleMute());
        document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('shareBtn').addEventListener('click', () => this.shareStream());
        document.getElementById('heartBtn').addEventListener('click', () => this.sendHeart());
    }

    initializeHLS() {
        if (Hls.isSupported()) {
            this.hls = new Hls({
                liveSyncDurationCount: 3,
                liveMaxLatencyDurationCount: 5,
                liveDurationInfinity: true,
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90
            });

            this.hls.attachMedia(this.video);
            
            this.hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                this.loadStream();
            });

            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                this.video.play();
                this.setOnlineStatus();
            });

            this.hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    this.handleError(data);
                }
            });
        } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
            // For Safari native HLS support
            this.video.src = this.streamUrl;
            this.video.addEventListener('loadedmetadata', () => {
                this.video.play();
                this.setOnlineStatus();
            });
        }
    }

    loadStream() {
        this.hls.loadSource(this.streamUrl);
    }

    handleError(data) {
        switch(data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
                console.error('Network error, attempting to recover...');
                if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR) {
                    this.setOfflineStatus();
                } else {
                    this.hls.startLoad();
                }
                break;
            case Hls.ErrorTypes.MEDIA_ERROR:
                console.error('Media error, attempting to recover...');
                this.hls.recoverMediaError();
                break;
            default:
                console.error('Fatal error, destroying HLS instance');
                this.hls.destroy();
                this.setOfflineStatus();
                break;
        }
    }

    setOnlineStatus() {
        this.offlineMessage.style.display = 'none';
        this.statusIndicator.innerHTML = '🔴 LIVE';
        this.statusIndicator.classList.add('live');
        this.updateViewerCount();
    }

    setOfflineStatus() {
        this.offlineMessage.style.display = 'flex';
        this.statusIndicator.innerHTML = '⏹️ OFFLINE';
        this.statusIndicator.classList.remove('live');
        this.viewerCount.innerHTML = '<i class="fas fa-eye me-1"></i>0 viewers';
    }

    refreshStream() {
        if (this.hls) {
            this.hls.destroy();
        }
        this.initializeHLS();
    }

    toggleMute() {
        this.video.muted = !this.video.muted;
        const muteBtn = document.getElementById('muteBtn');
        muteBtn.innerHTML = this.video.muted ? 
            '<i class="fa-solid fa-volume-xmark"></i>' : 
            '<i class="fa-solid fa-volume-high"></i>';
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.video.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    shareStream() {
        const shareData = {
            title: "Thắng's Live Stream",
            text: 'Watch the live stream now!',
            url: window.location.href
        };
        
        if (navigator.share) {
            navigator.share(shareData);
        } else {
            navigator.clipboard.writeText(window.location.href);
            alert('Link copied to clipboard!');
        }
    }

    sendHeart() {
        const heartBtn = document.getElementById('heartBtn');
        heartBtn.classList.add('pulse');
        setTimeout(() => heartBtn.classList.remove('pulse'), 600);
        
        // Send heart event to server
        fetch('http://14.225.220.70:8080/api/heart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp: Date.now() })
        });
    }

    updateViewerCount() {
        fetch('http://14.225.220.70:8080/api/viewers')
            .then(res => res.json())
            .then(data => {
                this.viewerCount.innerHTML = `<i class="fas fa-eye me-1"></i>${data.count} viewers`;
            })
            .catch(() => {
                this.viewerCount.innerHTML = '<i class="fas fa-eye me-1"></i>0 viewers';
            });
    }

    startPolling() {
        // Check stream status every 5 seconds
        setInterval(() => {
            if (this.statusIndicator.classList.contains('live')) {
                this.updateViewerCount();
            } else {
                // Try to reconnect if offline
                this.refreshStream();
            }
        }, 5000);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    new StreamViewer();
});
