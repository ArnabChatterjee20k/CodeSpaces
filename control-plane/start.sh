#!/bin/bash
set -e

echo "[*] Installing dependencies..."
yum update -y
yum install -y git gcc make zlib-devel bzip2 bzip2-devel readline-devel sqlite sqlite-devel \
               openssl-devel libffi-devel wget curl xz-devel

echo "[*] Installing pyenv..."
curl https://pyenv.run | bash

# Add pyenv to PATH for current and future sessions
export PATH="/root/.pyenv/bin:$PATH"
eval "$(pyenv init -)"
eval "$(pyenv virtualenv-init -)"

# Add to .bashrc for login shells
echo 'export PATH="/root/.pyenv/bin:$PATH"' >> ~/.bashrc
echo 'eval "$(pyenv init -)"' >> ~/.bashrc
echo 'eval "$(pyenv virtualenv-init -)"' >> ~/.bashrc

echo "[*] Installing Python 3.12 via pyenv..."
pyenv install 3.12.0
pyenv global 3.12.0

echo "[*] Verifying Python version..."
python --version  # should be 3.12.0

echo "[*] Installing pip packages..."
cd /opt/CodeSpaces/control_plane
pip install --upgrade pip
pip install -r requirements.txt

echo "[*] Starting FastAPI Control Plane..."
nohup fastapi run control_plane.py --port 8000 > control_plane.log 2>&1 &

echo "[*] Starting mitmproxy..."
nohup mitmweb \
    -s proxy.py \
    --mode regular \
    --listen-host 0.0.0.0 \
    --listen-port 5000 \
    --set web_port=5001 \
    --set block_global=false \
    > proxy.log 2>&1 &

echo "[+] All services started successfully."