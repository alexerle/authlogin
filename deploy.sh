#!/bin/bash

# Deployment script for auth.10hoch2.de
# Usage: ./deploy.sh

set -e

# Configuration
SERVER="root@37.27.254.59"
DEPLOY_PATH="/var/www/auth.10hoch2.de"
SERVER_PATH="/var/www/auth.10hoch2.de/server"

echo "=== Building Auth Portal ==="

# Keep the Auth branding pinned to the canonical 10hoch2 logo used by CRM.
# Vite copies everything from public/ into dist/, so fixing public/ before
# build prevents stale or wrong logo assets from being deployed again.
CANONICAL_LOGO="../07-coolify/crm.10hoch2.de/app/public/assets/10hoch2-logo.png"
if [ ! -f "$CANONICAL_LOGO" ]; then
    echo "ERROR: Canonical logo not found: $CANONICAL_LOGO"
    exit 1
fi
cp "$CANONICAL_LOGO" public/logo.png
cp "$CANONICAL_LOGO" public/10hoch2-logo.png

# Build frontend
echo "Building frontend..."
npm run build

if ! cmp -s "$CANONICAL_LOGO" dist/10hoch2-logo.png; then
    echo "ERROR: Built dist/10hoch2-logo.png does not match canonical logo"
    exit 1
fi

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
rm -rf dist
tar -xzf /tmp/auth-portal.tar.gz
chmod -R a+rX /var/www/auth.10hoch2.de/dist
chmod 755 /var/www/auth.10hoch2.de /var/www/auth.10hoch2.de/dist

# Install server dependencies
cd /var/www/auth.10hoch2.de/server
npm install --production

# Create .env file if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "WARNING: Please configure .env file!"
fi

# Keep passkeys outside the deploy directory so Auth deploys cannot hide or
# overwrite registered credentials.
mkdir -p /var/lib/authlogin
chmod 700 /var/lib/authlogin
if ! grep -q '^PASSKEY_STORE_PATH=' .env; then
    echo 'PASSKEY_STORE_PATH=/var/lib/authlogin/passkeys.json' >> .env
fi
if [ -f /var/www/auth.10hoch2.de/server/data/passkeys.json ] && [ ! -f /var/lib/authlogin/passkeys.json ]; then
    cp /var/www/auth.10hoch2.de/server/data/passkeys.json /var/lib/authlogin/passkeys.json
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
