#!/bin/bash
# So that the script exits whenever any command fails
set -e

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

#!/bin/bash
# So that the script exits whenever any command fails
set -e

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Install Python 3.12 and related dependencies
echo "Installing Python 3.12 and dependencies..."
sudo apt-get update -y
sudo apt-get install -y python3.12 python3.12-venv python3.12-dev

# Make python3.12 the default python3
sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1
sudo update-alternatives --set python3 /usr/bin/python3.12

# Install uv (ultra-fast Python package manager)
echo "Installing uv..."
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.cargo/bin:$PATH"

# Ensure we're using Python 3.12 and uv is available
PYTHON_CMD=$(which python3.12 2>/dev/null || which python3)
UV_CMD=$(which uv)

echo "Using Python: $PYTHON_CMD"
echo "Using uv: $UV_CMD"

# Verify Python version
$PYTHON_CMD --version

# Create virtual environment with uv
echo "Creating virtual environment with uv..."
$UV_CMD venv .venv --python $PYTHON_CMD

# Activate virtual environment
source .venv/bin/activate

# Install Python dependencies using uv (much faster than pip)
echo "Installing dependencies with uv..."
$UV_CMD pip install -r requirements.txt

# Start mitmproxy (virtual environment is already activated)
echo "Starting mitmproxy..."
nohup mitmweb \
  -s proxy.py \
  --mode regular \
  --listen-host 0.0.0.0 \
  --listen-port 5000 \
  --set web_port=5001 \
  --set block_global=false \
  > proxy.log 2>&1 &

# Start FastAPI (virtual environment is already activated)
echo "Starting FastAPI..."
nohup fastapi run control_plane.py --port 8000 > control_plane.log 2>&1 &

echo "Services started. Check proxy.log and control_plane.log for details."