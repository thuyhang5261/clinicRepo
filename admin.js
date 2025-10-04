class LiveStreamManager {
    constructor() {
        this.videoElement = document.getElementById('videoElement');
        this.canvas = document.getElementById('processCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.mediaStream = null;
        this.mediaRecorder = null;
        this.isStreaming = false;
        this.ws = null;
        this.facingMode = 'user';
        
        this.initializeControls();
    }

    initializeControls() {
        document.getElementById('cameraBtn').addEventListener('click', () => this.toggleCamera());
        document.getElementById('flipBtn').addEventListener('click', () => this.flipCamera());
        document.getElementById('liveBtn').addEventListener('click', () => this.toggleLiveStream());
        document.getElementById('voiceBtn').addEventListener('click', () => this.toggleMicrophone());
        document.getElementById('expandBtn').addEventListener('click', () => this.expandWindow());
        document.getElementById('closeBtn').addEventListener('click', () => this.closeWindow());
    }

    async toggleCamera() {
        if (!this.mediaStream) {
            await this.startCamera();
        } else {
            this.stopCamera();
        }
    }

    async startCamera() {
        try {
            const constraints = {
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: this.facingMode 
                },
                audio: true
            };
            
            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.mediaStream;
            
            document.getElementById('statusIndicator').innerHTML = '<i class="fas fa-video me-1"></i>Camera Ready';
            document.getElementById('cameraBtn').classList.add('active');
        } catch (error) {
            console.error('Error accessing camera:', error);
            alert('Failed to access camera');
        }
    }

    stopCamera() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
            this.videoElement.srcObject = null;
        }
        document.getElementById('cameraBtn').classList.remove('active');
        document.getElementById('statusIndicator').innerHTML = '<i class="fas fa-video me-1"></i>Click camera to start';
    }

    async flipCamera() {
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        if (this.mediaStream) {
            this.stopCamera();
            await this.startCamera();
        }
    }

    async toggleLiveStream() {
        if (!this.isStreaming) {
            await this.startStreaming();
        } else {
            this.stopStreaming();
        }
    }

    async startStreaming() {
        if (!this.mediaStream) {
            await this.startCamera();
        }

        try {
            // Connect to WebSocket for streaming
            this.ws = new WebSocket('ws://14.225.220.70:8080/live');
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.setupMediaRecorder();
                this.isStreaming = true;
                document.getElementById('liveBtn').classList.add('streaming');
                document.getElementById('liveBtn').innerHTML = '<i class="fas fa-stop-circle"></i> END LIVE';
                document.getElementById('statusIndicator').innerHTML = '<i class="fas fa-circle text-danger me-1"></i>LIVE';
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                alert('Failed to connect to streaming server');
                this.stopStreaming();
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.stopStreaming();
            };

        } catch (error) {
            console.error('Streaming error:', error);
            alert('Failed to start streaming');
        }
    }

    setupMediaRecorder() {
        const options = {
            mimeType: 'video/webm;codecs=vp8,opus',
            videoBitsPerSecond: 2500000
        };

        this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
        
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(event.data);
            }
        };

        this.mediaRecorder.start(1000); // Send chunks every second
    }

    stopStreaming() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        if (this.ws) {
            this.ws.close();
        }

        this.isStreaming = false;
        document.getElementById('liveBtn').classList.remove('streaming');
        document.getElementById('liveBtn').innerHTML = '<i class="fas fa-circle"></i> GO LIVE';
        document.getElementById('statusIndicator').innerHTML = '<i class="fas fa-video me-1"></i>Camera Ready';
    }

    toggleMicrophone() {
        if (this.mediaStream) {
            const audioTracks = this.mediaStream.getAudioTracks();
            audioTracks.forEach(track => {
                track.enabled = !track.enabled;
                document.getElementById('voiceBtn').classList.toggle('muted');
            });
        }
    }

    expandWindow() {
        document.getElementById('livestreamWindow').classList.toggle('expanded');
    }

    closeWindow() {
        this.stopStreaming();
        this.stopCamera();
        document.getElementById('livestreamWindow').style.display = 'none';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    new LiveStreamManager();
});
