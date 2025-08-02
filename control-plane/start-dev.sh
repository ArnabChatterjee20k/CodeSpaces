#!/bin/bash

start_control_plane=false
start_proxy=false

# Parse command-line arguments
for arg in "$@"
do
  case $arg in
    --control-plane)
      start_control_plane=true
      ;;
    --proxy)
      start_proxy=true
      ;;
    --all)
      start_control_plane=true
      start_proxy=true
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: ./start.sh [--control-plane] [--proxy] [--all]"
      exit 1
      ;;
  esac
done

# Start control plane (FastAPI dev)
if $start_control_plane; then
  echo "Starting FastAPI dev server..."
  # Run in background if both are started
  if $start_proxy; then
    fastapi dev control_plane.py --host 0.0.0.0 --port 8000 &
  else
    fastapi dev control_plane.py --host 0.0.0.0 --port 8000
  fi
fi

# Start mitmweb proxy
if $start_proxy; then
  echo "Starting mitmweb proxy..."
  mitmweb -s proxy.py \
    --mode regular \
    --listen-host 0.0.0.0 \
    --listen-port 5000 \
    --set web_port=5001 \
    --set block_global=false
fi
