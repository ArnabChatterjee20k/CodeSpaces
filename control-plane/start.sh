#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

APP_USER=$(whoami)
PYTHON_BIN="/usr/bin/python3.12"
UV_BIN="$HOME/.local/bin/uv"

if [ ! -f "$HOME/.local/bin/uv" ]; then
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
else
  echo "uv already installed."
fi

# Create virtual env if not exists
if [ ! -d "$SCRIPT_DIR/.venv" ]; then
  echo "Creating virtual environment..."
  $UV_BIN venv .venv --python "$PYTHON_BIN"
fi

source "$SCRIPT_DIR/.venv/bin/activate"
$UV_BIN pip install -r requirements.txt

# --- Create systemd service: proxy.service ---
sudo tee /etc/systemd/system/proxy.service > /dev/null <<EOF
[Unit]
Description=MITM Proxy Service
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$SCRIPT_DIR/.venv/bin/mitmweb -s proxy.py --mode regular --listen-host 0.0.0.0 --listen-port 5000 --set web_port=5001 --set block_global=false
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# --- Create systemd service: control-plane.service ---
sudo tee /etc/systemd/system/control-plane.service > /dev/null <<EOF
[Unit]
Description=FastAPI Control Plane Service
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$SCRIPT_DIR/.venv/bin/fastapi run control_plane.py --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "Reloading systemd daemon and enabling services..."
sudo systemctl daemon-reexec
sudo systemctl daemon-reload
sudo systemctl enable proxy.service
sudo systemctl enable control-plane.service

echo "Starting services..."
sudo systemctl start proxy.service
sudo systemctl start control-plane.service

echo "Services started. Check logs via:"
echo "  sudo journalctl -u proxy.service -f"
echo "  sudo journalctl -u control-plane.service -f"
