const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "settings.json");

const DEFAULT_SETTINGS = {
  room_name: "Restaurant Jukebox",
  max_duration_sec: 360,
  blacklist_keywords: ["10 hour", "1 hour", "สารคดี", "ธรณีกันแสง", "earrape", "bass boosted"],
  auto_house_music: true,
  house_genre: "เพลงชิล acoustic ฟังสบาย ร้านอาหาร",
  smart_ai_dj: true,
  bg_mode: "album_blur",
  bg_custom_url: "",
  master_volume: 1.0,
};

class SettingsDatabase {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        this.settings = { ...DEFAULT_SETTINGS, ...parsed };
        console.log("💾 [DB] Loaded settings from settings.json");
      } else {
        this.save();
      }
    } catch (err) {
      console.error("⚠️ [DB] Failed to read settings.json, using defaults:", err.message);
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.settings, null, 2), "utf-8");
      console.log("💾 [DB] Settings successfully persisted to settings.json");
    } catch (err) {
      console.error("⚠️ [DB] Failed to write settings.json:", err.message);
    }
  }

  get(key) {
    return this.settings[key];
  }

  getAll() {
    return { ...this.settings };
  }

  update(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.save();
    return this.settings;
  }
}

module.exports = new SettingsDatabase();
