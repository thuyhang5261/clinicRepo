#!/bin/bash

# Update deployment script
echo "🚀 Updating clinic streaming app on VPS..."

# Navigate to app directory
cd /var/www/clinic || { echo "Error: App directory not found"; exit 1; }

# Pull latest changes
echo "📥 Pulling latest code from GitHub..."
git pull origin master

# Install any new dependencies
echo "📦 Installing dependencies..."
npm install

# Restart PM2 process
echo "🔄 Restarting application..."
pm2 restart clinic-app

# Check status
echo "✅ Checking application status..."
pm2 status

echo "🎉 Deployment update complete!"
echo "🌐 Application should be available at: https://phongkhamhongnhan.com"