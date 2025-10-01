# Clinic LiveStream Application

[![CI/CD Pipeline](https://github.com/YOUR_USERNAME/clinic/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/YOUR_USERNAME/clinic/actions/workflows/ci-cd.yml)
[![Docker Build](https://github.com/YOUR_USERNAME/clinic/actions/workflows/docker.yml/badge.svg)](https://github.com/YOUR_USERNAME/clinic/actions/workflows/docker.yml)
[![Security Scan](https://github.com/YOUR_USERNAME/clinic/actions/workflows/security.yml/badge.svg)](https://github.com/YOUR_USERNAME/clinic/actions/workflows/security.yml)

A real-time livestreaming application built with Node.js, Socket.io, and WebRTC.

## 🚀 Features

- WebRTC-based live streaming
- Real-time chat with Socket.io
- RTMP server support
- Admin control panel
- Docker support
- CI/CD with GitHub Actions

## 📋 Prerequisites

- Node.js >= 16.0.0
- npm >= 8.0.0
- FFmpeg (for RTMP streaming)
- SSL certificates (for HTTPS/camera access)

## 🛠️ Installation

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/clinic.git
cd clinic
```

2. Install dependencies:
```bash
npm install
```

3. Create SSL certificates (for HTTPS):
```bash
mkdir ssl
openssl req -x509 -newkey rsa:4096 -keyout ssl/private.key -out ssl/certificate.crt -days 365 -nodes
```

4. Start the server:
```bash
npm start
```

## 🐳 Docker Deployment

Using Docker Compose:
```bash
docker-compose up -d
```

Using Docker:
```bash
docker build -t clinic-livestream .
docker run -p 3000:3000 -p 3443:3443 -p 1935:1935 -p 8000:8000 clinic-livestream
```

## 🔧 Configuration

### Environment Variables

- `NODE_ENV` - Environment (development/production)
- `PORT` - HTTP server port (default: 3000)
- `HTTPS_PORT` - HTTPS server port (default: 3443)

### GitHub Secrets (for Actions)

- `SERVER_HOST` - Deployment server IP/hostname
- `SERVER_USER` - SSH username
- `SERVER_SSH_KEY` - SSH private key
- `SERVER_PORT` - SSH port (default: 22)
- `SNYK_TOKEN` - Snyk authentication token

## 📱 Usage

### For Viewers
- Access the stream at: `http://localhost:3000` or `https://localhost:3443`

### For Admins
- Access admin panel at: `http://localhost:3000/admin` or `https://localhost:3443/admin`

### Camera Access
- For network access, use HTTPS: `https://YOUR_IP:3443/admin`
- For local development, use: `http://localhost:3000/admin`

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.
