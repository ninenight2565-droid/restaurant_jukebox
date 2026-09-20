const { spawn } = require("child_process");

// Ultra-fast dual search engine:
// 1. YouTube InnerTube API (Super fast ~200ms)
// 2. yt-dlp fallback (Bulletproof reliability)
function searchYouTube(query, limit = 12) {
  return new Promise((resolve) => {
    const py = spawn("python", [
      "-c",
      `
import json, sys, urllib.request

q = sys.argv[1]
items = []

# Method 1: YouTube InnerTube API (Lightning Fast)
try:
    data = json.dumps({
        'context': {'client': {'clientName': 'WEB', 'clientVersion': '2.20240101.00.00', 'hl': 'th', 'gl': 'TH'}},
        'query': q
    }).encode('utf-8')
    req = urllib.request.Request(
        'https://www.youtube.com/youtubei/v1/search',
        data=data,
        headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
    )
    with urllib.request.urlopen(req, timeout=4) as r:
        res = json.loads(r.read().decode('utf-8'))
        sections = res.get('contents', {}).get('twoColumnSearchResultsRenderer', {}).get('primaryContents', {}).get('sectionListRenderer', {}).get('contents', [])
        for sec in sections:
            contents = sec.get('itemSectionRenderer', {}).get('contents', [])
            for c in contents:
                v = c.get('videoRenderer')
                if v and v.get('videoId'):
                    vid = v['videoId']
                    title = v.get('title', {}).get('runs', [{}])[0].get('text') or ''
                    artist = v.get('ownerText', {}).get('runs', [{}])[0].get('text') or v.get('shortBylineText', {}).get('runs', [{}])[0].get('text') or 'ศิลปิน'
                    dur_str = v.get('lengthText', {}).get('simpleText') or '3:30'
                    parts = dur_str.split(':')
                    dur = int(parts[0]) * 60 + int(parts[1]) if len(parts) == 2 else (int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2]) if len(parts) == 3 else 210)
                    thumbs = v.get('thumbnail', {}).get('thumbnails', [])
                    thumb = thumbs[-1].get('url') if thumbs else f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
                    items.append({
                        'video_id': vid,
                        'title': title,
                        'artist': artist,
                        'duration': dur,
                        'duration_str': dur_str,
                        'thumbnail': thumb
                    })
                    if len(items) >= 12:
                        break
            if len(items) >= 12:
                break
except Exception:
    pass

# Method 2: yt-dlp Fallback if InnerTube yielded nothing
if not items:
    try:
        import yt_dlp
        ydl_opts = {'quiet': True, 'extract_flat': True, 'no_warnings': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(f"ytsearch12:{q}", download=False)
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
                    "thumbnail": f"https://i.ytimg.com/vi/{e.get('id')}/hqdefault.jpg"
                })
    except Exception:
        pass

print(json.dumps(items))
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
