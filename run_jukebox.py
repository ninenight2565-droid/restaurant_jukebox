import subprocess
import time
import sys
import os

base_dir = os.path.dirname(os.path.abspath(__file__))
server_dir = os.path.join(base_dir, "server")

print("=" * 60)
print("🎵 STARTING RESTAURANT JUKEBOX WITH TRUE AUTOPLAY ENABLED")
print("=" * 60)

# 1. Start Node.js Server
node_proc = subprocess.Popen(["node", "server.js"], cwd=server_dir)
time.sleep(1.5)

player_url = "http://localhost:8888/player"
print(f"📺 Opening Native Player App: {player_url}")

# 2. Launch Microsoft Edge in Dedicated Desktop App Mode with Autoplay Policy Bypassed
# --autoplay-policy=no-user-gesture-required : อนุญาตให้เล่นเสียงเพลงทันทีโดยไม่ต้องคลิกหน้าจอเลย!
edge_paths = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe")
]

edge_exe = None
for p in edge_paths:
    if os.path.exists(p):
        edge_exe = p
        break

if edge_exe:
    cmd = [
        edge_exe,
        f"--app={player_url}",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies",
        "--window-size=1280,720"
    ]
    subprocess.Popen(cmd)
else:
    # Fallback to webview or browser
    try:
        import webview
        window = webview.create_window(
            title="Restaurant Jukebox Player",
            url=player_url,
            width=1280,
            height=720
        )
        webview.start()
    except Exception:
        import webbrowser
        webbrowser.open(player_url)

try:
    node_proc.wait()
except KeyboardInterrupt:
    node_proc.terminate()
