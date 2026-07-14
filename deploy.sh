#!/usr/bin/env bash
# Quickly AI Deployment Script for Alibaba Cloud ECS (Ubuntu/CentOS)
# Usage: chmod +x deploy.sh && ./deploy.sh

set -e

APP_DIR="/opt/quickly"
NODE_VERSION="22"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Quickly AI — Server Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Install Node.js (if missing)
if ! command -v node &>/dev/null; then
  echo "[1/5] Installing Node.js ${NODE_VERSION}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "[1/5] Node.js $(node -v) ✓"
fi

# 2. Install PM2 (process manager)
if ! command -v pm2 &>/dev/null; then
  echo "[2/5] Installing PM2..."
  sudo npm install -g pm2
else
  echo "[2/5] PM2 $(pm2 -v) ✓"
fi

# 3. Clone or update project
if [ -d "$APP_DIR" ]; then
  echo "[3/5] Updating project..."
  cd "$APP_DIR"
  git pull
else
  echo "[3/5] Cloning project..."
  sudo mkdir -p "$APP_DIR"
  sudo chown $USER:$USER "$APP_DIR"
  git clone https://github.com/YOUR_USERNAME/quickly.git "$APP_DIR"
  cd "$APP_DIR"
fi

# 4. Install dependencies & build
echo "[4/5] Building project..."
cd front
npm install
npm run build

# 5. Start with PM2
echo "[5/5] Starting service..."
pm2 delete quickly 2>/dev/null || true
pm2 start dist/server.cjs \
  --name quickly \
  --env production \
  --update-env

pm2 save
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Deployment complete!"
echo "  Server running at: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP')"
echo "  PM2 commands:"
echo "    pm2 status        — View status"
echo "    pm2 logs quickly  — View logs"
echo "    pm2 restart quickly — Restart"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
