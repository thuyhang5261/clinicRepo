#!/bin/bash

# VPS Deployment Script for Clinic Live Streaming
# Run this on your VPS at 14.225.220.70

echo "🚀 Deploying Clinic Live Streaming Application..."

# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js (if not already installed)
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 3. Install FFmpeg (if not already installed)
if ! command -v ffmpeg &> /dev/null; then
    echo "Installing FFmpeg..."
    sudo apt install -y ffmpeg
fi

# 4. Install PM2 globally (if not already installed)
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# 5. Create application directory
APP_DIR="/var/www/clinic"
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR

# 6. Clone or update your repository
if [ -d "$APP_DIR/.git" ]; then
    echo "Updating existing repository..."
    cd $APP_DIR
    git pull origin master
else
    echo "Cloning repository..."
    git clone https://github.com/thuyhang5261/clinicRepo.git $APP_DIR
    cd $APP_DIR
fi

# 7. Install dependencies
echo "Installing Node.js dependencies..."
npm install

# 8. Create HLS directory
sudo mkdir -p $APP_DIR/public/hls
sudo chown -R $USER:$USER $APP_DIR/public/hls
sudo chmod -R 755 $APP_DIR/public/hls

# 9. Copy nginx configuration
sudo cp nginx.conf /etc/nginx/nginx.conf

# 10. Start/restart services
echo "Starting application with PM2..."
pm2 stop clinic-app 2>/dev/null || true
pm2 start server.js --name clinic-app
pm2 save
pm2 startup

# 11. Restart nginx
sudo systemctl restart nginx
sudo systemctl enable nginx

# 12. Setup firewall
sudo ufw allow 22      # SSH
sudo ufw allow 80      # HTTP
sudo ufw allow 443     # HTTPS
sudo ufw allow 1935    # RTMP
sudo ufw allow 3000    # Node.js (for debugging)
sudo ufw --force enable

echo "✅ Deployment complete!"
echo "📱 Admin Panel: https://phongkhamhongnhan.com/admin"
echo "📺 Viewer: https://phongkhamhongnhan.com/"
echo "📊 Status: pm2 status"
echo "📋 Logs: pm2 logs clinic-app"