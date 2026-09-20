class QueueManager {
  constructor(roomId = "default", roomName = "Restaurant Jukebox", savedSettings = {}) {
    this.roomId = roomId;
    this.roomName = savedSettings.room_name || roomName;
    this.isAcceptingRequests = true;
    this.queue = [];
    this.currentSong = null;
    this.history = [];
    
    // Playback state
    this.isPlaying = true;
    this.masterVolume = typeof savedSettings.master_volume === "number" ? savedSettings.master_volume : 1.0;
    this.currentTime = 0;
    this.duration = 0;

    // Rules & Moderation
    this.maxDurationSec = savedSettings.max_duration_sec || 360;
    this.blacklistKeywords = savedSettings.blacklist_keywords || ["10 hour", "1 hour", "สารคดี", "ธรณีกันแสง", "earrape", "bass boosted"];

    // House Vibe
    this.autoHouseMusic = typeof savedSettings.auto_house_music === "boolean" ? savedSettings.auto_house_music : true;
    this.houseGenre = savedSettings.house_genre || "เพลงชิล acoustic ฟังสบาย ร้านอาหาร";
    this.smartAIDJ = typeof savedSettings.smart_ai_dj === "boolean" ? savedSettings.smart_ai_dj : true;
    this.lastUserSong = null;

    // Custom Background Settings
    this.bgMode = savedSettings.bg_mode || "album_blur";
    this.bgCustomUrl = savedSettings.bg_custom_url || "";

    // Callback when room settings change to persist in roomManager
    this.onSettingsChange = null;
  }

  getSettings() {
    return {
      room_name: this.roomName,
      master_volume: this.masterVolume,
      max_duration_sec: this.maxDurationSec,
      blacklist_keywords: this.blacklistKeywords,
      auto_house_music: this.autoHouseMusic,
      house_genre: this.houseGenre,
      smart_ai_dj: this.smartAIDJ,
      bg_mode: this.bgMode,
      bg_custom_url: this.bgCustomUrl,
    };
  }

  triggerSettingsChange() {
    if (typeof this.onSettingsChange === "function") {
      this.onSettingsChange(this.getSettings());
    }
  }

  getFullState() {
    return {
      room_id: this.roomId,
      room_name: this.roomName,
      is_accepting_requests: this.isAcceptingRequests,
      current_song: this.currentSong,
      queue: this.queue,
      history: this.history.slice(-10),
      queue_count: this.queue.length,
      is_playing: this.isPlaying,
      master_volume: this.masterVolume,
      current_time: this.currentTime,
      duration: this.duration,
      max_duration_sec: this.maxDurationSec,
      blacklist_keywords: this.blacklistKeywords,
      auto_house_music: this.autoHouseMusic,
      house_genre: this.houseGenre,
      smart_ai_dj: this.smartAIDJ,
      bg_mode: this.bgMode,
      bg_custom_url: this.bgCustomUrl,
    };
  }

  addToQueue(songInfo, userName = "", tableNo = "", userId = "") {
    if (!this.isAcceptingRequests) {
      throw new Error("ทางห้องปิดรับคิวเพลงชั่วคราว");
    }

    // 1. Check Max Duration
    if (songInfo.duration && songInfo.duration > this.maxDurationSec) {
      const maxMin = Math.floor(this.maxDurationSec / 60);
      throw new Error(`เพลงยาวเกินกำหนด (สูงสุด ${maxMin} นาที)`);
    }

    // 2. Check Blacklist Keywords
    const titleLower = (songInfo.title || "").toLowerCase();
    for (const word of this.blacklistKeywords) {
      if (word.trim() && titleLower.includes(word.trim().toLowerCase())) {
        throw new Error(`เพลงนี้มีคำที่ไม่อนุญาตในห้อง ("${word}")`);
      }
    }

    const item = {
      id: Math.random().toString(36).substring(2, 11),
      video_id: songInfo.video_id,
      title: songInfo.title,
      artist: songInfo.artist || "ศิลปิน",
      duration: songInfo.duration || 240,
      duration_str: songInfo.duration_str || "3:30",
      thumbnail: songInfo.thumbnail,
      user_name: userName,
      table_no: tableNo,
      user_id: userId,
      requested_at: Date.now(),
      is_house: false,
    };

    if (!item.is_house) {
      this.lastUserSong = item;
    }

    // If no song is playing OR current song is house ambient, auto cut-in
    if (!this.currentSong || this.currentSong.is_house) {
      this.currentSong = item;
      this.isPlaying = true;
      return { item, autoPlayed: true };
    } else {
      this.queue.push(item);
      return { item, autoPlayed: false };
    }
  }

  skipSong() {
    if (this.currentSong && !this.currentSong.is_house) {
      this.history.push(this.currentSong);
    }

    if (this.queue.length > 0) {
      this.currentSong = this.queue.shift();
      this.isPlaying = true;
      this.currentTime = 0;
      return this.currentSong;
    } else {
      this.currentSong = null;
      this.currentTime = 0;
      return null;
    }
  }

  playNow(itemId) {
    const idx = this.queue.findIndex((s) => s.id === itemId);
    if (idx !== -1) {
      const [item] = this.queue.splice(idx, 1);
      if (this.currentSong && !this.currentSong.is_house) {
        this.history.push(this.currentSong);
      }
      this.currentSong = item;
      this.isPlaying = true;
      this.currentTime = 0;
      return true;
    }
    return false;
  }

  removeFromQueue(itemId) {
    this.queue = this.queue.filter((s) => s.id !== itemId);
  }

  moveUp(itemId) {
    const idx = this.queue.findIndex((s) => s.id === itemId);
    if (idx > 0) {
      const temp = this.queue[idx];
      this.queue[idx] = this.queue[idx - 1];
      this.queue[idx - 1] = temp;
    }
  }

  moveDown(itemId) {
    const idx = this.queue.findIndex((s) => s.id === itemId);
    if (idx !== -1 && idx < this.queue.length - 1) {
      const temp = this.queue[idx];
      this.queue[idx] = this.queue[idx + 1];
      this.queue[idx + 1] = temp;
    }
  }

  shuffleQueue() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  clearQueue() {
    this.queue = [];
  }

  setPlaying(isPlaying) {
    this.isPlaying = isPlaying;
  }

  setVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.triggerSettingsChange();
  }

  setProgress(currentTime, duration) {
    this.currentTime = currentTime;
    if (duration) this.duration = duration;
  }

  setMaxDuration(sec) {
    this.maxDurationSec = Math.max(60, parseInt(sec) || 360);
    this.triggerSettingsChange();
  }

  setBlacklist(keywords) {
    if (Array.isArray(keywords)) {
      this.blacklistKeywords = keywords;
      this.triggerSettingsChange();
    }
  }

  setHouseGenre(genre) {
    this.houseGenre = genre || "เพลงชิล acoustic ฟังสบาย ร้านอาหาร";
    this.triggerSettingsChange();
  }

  setAutoHouse(status) {
    this.autoHouseMusic = status;
    this.triggerSettingsChange();
  }

  setSmartAIDJ(status) {
    this.smartAIDJ = status;
    this.triggerSettingsChange();
  }

  setBackground(mode, customUrl = "") {
    if (["album_blur", "custom_image", "dark_minimal"].includes(mode)) {
      this.bgMode = mode;
    }
    if (typeof customUrl === "string") {
      this.bgCustomUrl = customUrl;
    }
    this.triggerSettingsChange();
  }
}

module.exports = QueueManager;
