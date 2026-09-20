const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// Cache stream URLs in-memory (expires after 2 hours)
const urlCache = new Map();

function getDirectAudioUrl(videoId) {
  return new Promise((resolve, reject) => {
    if (urlCache.has(videoId)) {
      const cached = urlCache.get(videoId);
      if (Date.now() - cached.timestamp < 3600000) { // 1 hour valid
        return resolve(cached.url);
      }
    }

    // Check for portable standalone yt-dlp.exe in bin directory
    const binYtDlp = path.join(__dirname, "../bin/yt-dlp.exe");
    let proc;

    if (fs.existsSync(binYtDlp)) {
      // Use portable yt-dlp.exe directly (No python required at all!)
      proc = spawn(binYtDlp, [
        "-f", "bestaudio[ext=m4a]/bestaudio/best",
        "--get-url",
        "--no-warnings",
        `https://www.youtube.com/watch?v=${videoId}`
      ]);
    } else {
      // Fallback to python
      proc = spawn("python", [
        "-c",
        `
import yt_dlp, sys
ydl_opts = {'format': 'bestaudio[ext=m4a]/bestaudio/best', 'quiet': True, 'no_warnings': True}
try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info('https://www.youtube.com/watch?v=${videoId}', download=False)
        print(info['url'])
except Exception as e:
    sys.exit(1)
        `
      ]);
    }

    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", (code) => {
      const url = output.trim();
      if (code === 0 && url && url.startsWith("http")) {
        urlCache.set(videoId, { url, timestamp: Date.now() });
        resolve(url);
      } else {
        reject(new Error("Failed to extract direct audio URL"));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

module.exports = { getDirectAudioUrl };
