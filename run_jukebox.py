import subprocess
import time
import os
import webbrowser

base_dir = os.path.dirname(os.path.abspath(__file__))
server_dir = os.path.join(base_dir, "server")

print("=" * 60)
print("🎵 STARTING RESTAURANT JUKEBOX HOST")
print("=" * 60)

# 1. Start Node.js Server
node_proc = subprocess.Popen(["node", "server.js"], cwd=server_dir)
time.sleep(1.5)

lobby_url = "http://localhost:8888/"
print(f"🌐 Opening Web Page: {lobby_url}")

# 2. Open standard web browser to the Lobby page only (no extra player popup)
webbrowser.open(lobby_url)

try:
    node_proc.wait()
except KeyboardInterrupt:
    node_proc.terminate()
