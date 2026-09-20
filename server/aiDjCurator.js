const http = require("http");
const { spawn } = require("child_process");

class AIDJCurator {
  constructor() {
    // Keep a long-term anti-repetition memory (up to 200 songs)
    this.playedSongsHistory = new Set();
    this.playedTitlesList = [];
    this.maxHistorySize = 150;
    this.ollamaUrl = "http://127.0.0.1:11434/api/generate";
    this.ollamaModel = "qwen2.5:3b"; // Or llama3.2, mistral, etc.
  }

  // Register a played song into anti-repetition memory
  markPlayed(title, videoId) {
    if (videoId) this.playedSongsHistory.add(videoId);
    if (title) {
      const cleanTitle = this.normalizeTitle(title);
      this.playedSongsHistory.add(cleanTitle);
      this.playedTitlesList.push(title);
      if (this.playedTitlesList.length > this.maxHistorySize) {
        const removed = this.playedTitlesList.shift();
        this.playedSongsHistory.delete(this.normalizeTitle(removed));
      }
    }
  }

  normalizeTitle(title) {
    return (title || "")
      .toLowerCase()
      .replace(/[\[\]\(\)\-\_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  isAlreadyPlayed(title, videoId) {
    if (videoId && this.playedSongsHistory.has(videoId)) return true;
    if (title) {
      const clean = this.normalizeTitle(title);
      for (const item of this.playedSongsHistory) {
        if (clean.includes(item) || item.includes(clean)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Main entrance: Get next smart song recommendation
   * 1. If seedSong exists (user recently requested): find related track via Local AI or YouTube Music Seed Radio
   * 2. If no seed: generate fresh track via Local AI or Fallback Genres
   */
  async getNextSmartTrack({ seedSong, houseGenre, maxDurationSec = 360 }) {
    console.log(`🧠 [AI DJ] Calculating next track... Seed: ${seedSong ? `"${seedSong.title}" (${seedSong.artist})` : "None (Using House Vibe)"}`);

    // METHOD A: Local AI (Ollama) if available
    try {
      const aiSuggestions = await this.askLocalAI(seedSong, houseGenre);
      if (aiSuggestions && aiSuggestions.length > 0) {
        console.log(`🤖 [AI DJ] Local AI recommended queries:`, aiSuggestions);
        // Search YouTube for the best AI recommendation
        for (const query of aiSuggestions) {
          const results = await this.searchYouTube(query, 5);
          const filtered = results.filter((s) => s.duration <= maxDurationSec && !this.isAlreadyPlayed(s.title, s.video_id));
          if (filtered.length > 0) {
            const picked = filtered[0];
            this.markPlayed(picked.title, picked.video_id);
            return { song: picked, source: "local_ai", reason: seedSong ? `AI แนะนำต่อยอดจาก "${seedSong.title}"` : `AI แนะนำตามแนวเพลงร้าน` };
          }
        }
      }
    } catch (err) {
      // Local AI not running or timed out, gracefully continue to Method B
    }

    // METHOD B: YouTube Music Seed Radio (RDAMVM) if seedSong exists
    if (seedSong && seedSong.video_id) {
      try {
        console.log(`🧲 [AI DJ] Fetching Related Tracks for Video ID: ${seedSong.video_id}...`);
        const radioTracks = await this.fetchSeedRadioTracks(seedSong.video_id);
        const fresh = radioTracks.filter((t) => t.duration <= maxDurationSec && !this.isAlreadyPlayed(t.title, t.video_id));
        if (fresh.length > 0) {
          // Pick a random track from the top 5 to keep it dynamic and fresh
          const topPool = fresh.slice(0, 5);
          const picked = topPool[Math.floor(Math.random() * topPool.length)];
          this.markPlayed(picked.title, picked.video_id);
          return { song: picked, source: "seed_radio", reason: `ต่อยอดจากเพลง "${seedSong.title}" ที่ลูกค้าเพิ่งเปิด` };
        }
      } catch (err) {
        console.warn(`[AI DJ] Seed Radio error:`, err.message);
      }
    }

    // METHOD C: Smart Query Rotation (Artist + Related genre + Variation keywords)
    console.log(`🔄 [AI DJ] Using Smart Search Query Rotation...`);
    const searchQueries = this.generateDynamicQueries(seedSong, houseGenre);
    for (const q of searchQueries) {
      const results = await this.searchYouTube(q, 10);
      const fresh = results.filter((s) => s.duration <= maxDurationSec && !this.isAlreadyPlayed(s.title, s.video_id));
      if (fresh.length > 0) {
        const picked = fresh[Math.floor(Math.random() * Math.min(fresh.length, 4))];
        this.markPlayed(picked.title, picked.video_id);
        return { song: picked, source: "smart_query", reason: seedSong ? `เพลงสไตล์ใกล้เคียง "${seedSong.artist || seedSong.title}"` : `เพลงคุมโทนร้าน` };
      }
    }

    // Absolute fallback: If all else filtered, reset history cache & pick from general search
    this.playedSongsHistory.clear();
    const fallbackResults = await this.searchYouTube(houseGenre || "เพลงสากล ชิลๆ", 10);
    const chosen = fallbackResults[0] || null;
    if (chosen) this.markPlayed(chosen.title, chosen.video_id);
    return { song: chosen, source: "fallback", reason: "เพลงประจำร้าน" };
  }

  // Ask Local Ollama AI (with timeout 2.5s so player never stalls)
  askLocalAI(seedSong, houseGenre) {
    return new Promise((resolve, reject) => {
      const playedExclusions = this.playedTitlesList.slice(-15).join(", ");
      let prompt = "";
      if (seedSong) {
        prompt = `You are an expert music DJ at a modern cafe/bar.
The customer just played: "${seedSong.title}" by "${seedSong.artist}".
Suggest 4 different popular similar songs and artists that match this exact vibe, genre, and tempo.
DO NOT suggest any of these previously played songs: [${playedExclusions}].
Output ONLY a JSON array of strings formatted like: ["Artist - Song Title", "Artist - Song Title"] with no markdown formatting.`;
      } else {
        prompt = `You are an expert music DJ at a cafe/bar with music theme: "${houseGenre}".
Suggest 4 different relaxing, high-quality songs that fit this cafe vibe.
DO NOT suggest any of these previously played songs: [${playedExclusions}].
Output ONLY a JSON array of strings formatted like: ["Artist - Song Title", "Artist - Song Title"] with no markdown formatting.`;
      }

      const postData = JSON.stringify({
        model: this.ollamaModel,
        prompt: prompt,
        stream: false,
      });

      const req = http.request(
        this.ollamaUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          },
          timeout: 2500, // Fast timeout
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              const responseText = parsed.response || "";
              // Extract JSON array from model text
              const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
              if (jsonMatch) {
                const list = JSON.parse(jsonMatch[0]);
                if (Array.isArray(list)) return resolve(list);
              }
              resolve([]);
            } catch (e) {
              resolve([]);
            }
          });
        }
      );

      req.on("error", (e) => resolve([]));
      req.on("timeout", () => {
        req.destroy();
        resolve([]);
      });
      req.write(postData);
      req.end();
    });
  }

  // Fetch YouTube Music Seed Radio tracks (RDAMVM)
  fetchSeedRadioTracks(videoId) {
    return new Promise((resolve) => {
      const py = spawn("python", [
        "-c",
        `
import urllib.request, json, sys

video_id = sys.argv[1]
req_body = json.dumps({
    'context': {'client': {'clientName': 'WEB_REMIX', 'clientVersion': '1.20230515.01.00', 'hl': 'th', 'gl': 'TH'}},
    'playlistId': f'RDAMVM{video_id}'
}).encode('utf-8')

req = urllib.request.Request(
    'https://music.youtube.com/youtubei/v1/next',
    data=req_body,
    headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
)
try:
    resp = urllib.request.urlopen(req, timeout=4)
    data = json.loads(resp.read().decode('utf-8'))
    tracks = []
    def find_tracks(obj):
        if isinstance(obj, dict):
            if 'playlistPanelVideoRenderer' in obj:
                tracks.append(obj['playlistPanelVideoRenderer'])
            for k, v in obj.items():
                find_tracks(v)
        elif isinstance(obj, list):
            for it in obj:
                find_tracks(it)
    find_tracks(data)
    items = []
    for t in tracks:
        v_id = t.get('videoId')
        if not v_id or v_id == video_id:
            continue
        title = t.get('title', {}).get('runs', [{}])[0].get('text')
        artist = t.get('longBylineText', {}).get('runs', [{}])[0].get('text') or 'ศิลปิน'
        dur_str = t.get('lengthText', {}).get('runs', [{}])[0].get('text') or '3:30'
        # convert dur_str to sec
        parts = dur_str.split(':')
        dur_sec = int(parts[0]) * 60 + int(parts[1]) if len(parts) == 2 else 210
        items.append({
            'video_id': v_id,
            'title': title,
            'artist': artist,
            'duration': dur_sec,
            'duration_str': dur_str,
            'thumbnail': f'https://i.ytimg.com/vi/{v_id}/maxresdefault.jpg'
        })
    print(json.dumps(items))
except Exception as e:
    print(json.dumps([]))
        `,
        videoId,
      ]);

      let output = "";
      py.stdout.on("data", (d) => {
        output += d.toString();
      });
      py.on("close", () => {
        try {
          const parsed = JSON.parse(output.trim());
          resolve(parsed);
        } catch {
          resolve([]);
        }
      });
      py.on("error", () => resolve([]));
    });
  }

  // Search YouTube
  searchYouTube(query, limit = 10) {
    return new Promise((resolve) => {
      const py = spawn("python", [
        "-c",
        `
import yt_dlp, json, sys

q = sys.argv[1]
limit = int(sys.argv[2])
ydl_opts = {'quiet': True, 'extract_flat': True, 'no_warnings': True}
try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        res = ydl.extract_info(f"ytsearch{limit}:{q}", download=False)
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
        query,
        limit.toString(),
      ]);

      let output = "";
      py.stdout.on("data", (d) => {
        output += d.toString();
      });
      py.on("close", () => {
        try {
          const parsed = JSON.parse(output.trim());
          resolve(parsed);
        } catch {
          resolve([]);
        }
      });
      py.on("error", () => resolve([]));
    });
  }

  // Generate dynamic queries with variations to avoid repetitions
  generateDynamicQueries(seedSong, houseGenre) {
    const list = [];
    if (seedSong && seedSong.artist && seedSong.artist !== "ศิลปิน") {
      list.push(`${seedSong.artist} เพลงฮิต`);
      list.push(`${seedSong.artist} cover acoustic`);
      list.push(`เพลงคล้ายกับ ${seedSong.artist}`);
    }
    if (houseGenre) {
      const variations = [
        "playlist ฟังสบาย",
        "เพลงเพราะๆ ติดหู",
        "acoustic cafe chill vibe",
        "live session official",
        "indie pop chill relaxing",
      ];
      const randomVariation = variations[Math.floor(Math.random() * variations.length)];
      list.push(`${houseGenre} ${randomVariation}`);
      list.push(houseGenre);
    } else {
      list.push("เพลงไทย ฟังสบาย ร้านอาหาร acoustic");
    }
    return list;
  }
}

module.exports = new AIDJCurator();
