const { spawn } = require("child_process");

function searchYouTube(query, limit = 12) {
  return new Promise((resolve) => {
    const py = spawn("python", [
      "-c",
      `
import yt_dlp, json, sys

q = sys.argv[1]
ydl_opts = {'quiet': True, 'extract_flat': True, 'no_warnings': True}
try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        res = ydl.extract_info(f"ytsearch12:{q}", download=False)
        items = []
        for e in res.get('entries', []):
            dur = int(e.get('duration') or 200)
            m = dur // 60
            s = dur % 60
            items.append({
                "video_id": e.get('id'),
                "title": e.get('title'),
                "artist": e.get('channel') or e.get('uploader') or "ศิลปิน",
                "duration": dur,
                "duration_str": f"{m}:{s:02d}",
                "thumbnail": f"https://i.ytimg.com/vi/{e.get('id')}/maxresdefault.jpg"
            })
        print(json.dumps(items))
except Exception as ex:
    print(json.dumps([]))
      `,
      query
    ]);

    let output = "";
    py.stdout.on("data", (d) => { output += d.toString(); });
    py.on("close", () => {
      try {
        const parsed = JSON.parse(output.trim());
        resolve(parsed);
      } catch (e) {
        resolve([]);
      }
    });
    py.on("error", () => resolve([]));
  });
}

module.exports = { searchYouTube };
