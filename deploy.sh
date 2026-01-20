#!/bin/bash

# Deployment script for auth.10hoch2.de
# Usage: ./deploy.sh

set -e

# Configuration
SERVER="root@37.27.254.59"
DEPLOY_PATH="/var/www/auth.10hoch2.de"
SERVER_PATH="/var/www/auth.10hoch2.de/server"

echo "=== Building Auth Portal ==="

# Build frontend
echo "Building frontend..."
npm run build

# Create deployment package
echo "Creating deployment package..."
tar -czf auth-portal.tar.gz dist/ server/

echo "=== Deploying to Server ==="

# Upload to server
echo "Uploading files..."
scp auth-portal.tar.gz $SERVER:/tmp/

# Execute deployment on server
ssh $SERVER << 'ENDSSH'
set -e

# Create directories
mkdir -p /var/www/auth.10hoch2.de

# Extract files
cd /var/www/auth.10hoch2.de
tar -xzf /tmp/auth-portal.tar.gz

# Install server dependencies
cd /var/www/auth.10hoch2.de/server
npm install --production

# Create .env file if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "WARNING: Please configure .env file!"
fi

# Setup PM2
pm2 delete auth-portal 2>/dev/null || true
pm2 start index.js --name auth-portal
pm2 save

# Cleanup
rm /tmp/auth-portal.tar.gz

echo "Deployment complete!"
ENDSSH

# Cleanup local
rm auth-portal.tar.gz

echo "=== Deployment Successful ==="
echo "Frontend: https://auth.10hoch2.de"
echo "Don't forget to:"
echo "1. Configure /var/www/auth.10hoch2.de/server/.env"
echo "2. Setup Nginx (copy nginx.conf to /etc/nginx/sites-available/)"
echo "3. Get SSL certificate: certbot --nginx -d auth.10hoch2.de"
