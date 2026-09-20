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

    const py = spawn("python", [
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

    let output = "";
    py.stdout.on("data", (data) => {
      output += data.toString();
    });

    py.on("close", (code) => {
      const url = output.trim();
      if (code === 0 && url && url.startsWith("http")) {
        urlCache.set(videoId, { url, timestamp: Date.now() });
        resolve(url);
      } else {
        reject(new Error("Failed to extract direct audio URL"));
      }
    });

    py.on("error", (err) => {
      reject(err);
    });
  });
}

module.exports = { getDirectAudioUrl };
