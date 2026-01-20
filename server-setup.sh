#!/bin/bash

# Server setup script for auth.10hoch2.de
# Run this on the server (37.27.254.59)

set -e

echo "=== Setting up Auth Portal Server ==="

# Update system
apt-get update
apt-get upgrade -y

# Install Node.js 20.x if not installed
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Install Nginx if not installed
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    apt-get install -y nginx
fi

# Install Certbot for SSL
if ! command -v certbot &> /dev/null; then
    echo "Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
fi

# Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

# Create directories
mkdir -p /var/www/auth.10hoch2.de

# Setup Nginx
echo "Setting up Nginx..."
cat > /etc/nginx/sites-available/auth.10hoch2.de << 'NGINXCONF'
server {
    listen 80;
    server_name auth.10hoch2.de;

    root /var/www/auth.10hoch2.de/dist;
    index index.html;

    # API routes -> Node.js backend
    location /auth/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /health {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINXCONF

# Enable site
ln -sf /etc/nginx/sites-available/auth.10hoch2.de /etc/nginx/sites-enabled/

# Test Nginx config
nginx -t

# Reload Nginx
systemctl reload nginx

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Deploy the auth-portal files to /var/www/auth.10hoch2.de"
echo "2. Configure /var/www/auth.10hoch2.de/server/.env"
echo "3. Get SSL certificate: certbot --nginx -d auth.10hoch2.de"
echo "4. Start the server: cd /var/www/auth.10hoch2.de/server && pm2 start index.js --name auth-portal"
echo ""
echo "SuperTokens Core is already running on port 3567"
