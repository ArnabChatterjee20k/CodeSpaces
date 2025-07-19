from flask import Flask, request
import threading
import subprocess

PORTS = [3001,3002]
PROXY_URL = "localhost:5000"
USED_PORTS = []

app = Flask(__name__)

def start_codermon(port: int):
    try:
        cmd = [
            "docker", "run", "-d",
            "-p", f"{port}:8080",
            "--name", f"codermon_{port}",
            "--rm",
            "codercom/code-server",
            "--auth", "none"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        container_id = result.stdout.strip()
        print(f"Started codermon on port {port} with container ID: {container_id}")
        return container_id
    except subprocess.CalledProcessError as e:
        print("Failed to start codermon container:", e.stderr)
        return ""

def start_mitmproxy():
    subprocess.run([
        "mitmdump",
        "-s", "proxy.py",
        "--mode", "regular",
        "--listen-port", "5000"
    ])


### TODO: check the orchastrator auth token first or the key first

@app.post("/start")
def start():
    token = request.args.get("token")
    for port in PORTS:
        if port not in USED_PORTS:
            break
    PORTS.remove(port)
    start_codermon(port)

    return {
        "url":f"{PROXY_URL}?token={token}"
    }

# to get the count of containers running
@app.get("/containers")
def conatiners_in_use():
    return []


if __name__ == "__main__":
    threading.Thread(target=start_mitmproxy, daemon=True).start()
    app.run(port=8000)