const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const QueueManager = require("./queueManager");

const ROOMS_FILE = path.join(__dirname, "rooms.json");

// Super Admin Credentials
const SUPER_ADMIN = {
  username: "jetwit",
  password: "704658009zxczZ",
};

// 2 Hours of inactivity before cleanup (in milliseconds)
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000;

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.superAdminTokens = new Set();
    this.loadRooms();
    
    // Ensure default room exists if none exist
    if (this.rooms.size === 0) {
      this.createRoom({
        id: "main",
        name: "Main Room",
        adminPin: "1234",
        roomPasscode: "",
      });
    }

    // Start auto-cleanup background task (every 10 minutes)
    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveRooms();
    }, 10 * 60 * 1000);
  }

  loadRooms() {
    try {
      if (fs.existsSync(ROOMS_FILE)) {
        const data = JSON.parse(fs.readFileSync(ROOMS_FILE, "utf-8"));
        for (const r of data) {
          const qm = new QueueManager(r.id, r.name, r.settings || {});
          qm.onSettingsChange = (newSettings) => {
            r.settings = newSettings;
            this.saveRooms();
          };
          this.rooms.set(r.id, {
            ...r,
            lastActive: r.lastActive || r.createdAt || Date.now(),
            queueManager: qm,
          });
        }
        console.log(` Loaded ${this.rooms.size} room(s) from storage.`);
      }
    } catch (err) {
      console.error("Failed to load rooms.json:", err);
    }
  }

  saveRooms() {
    try {
      const serializable = [];
      for (const [id, room] of this.rooms.entries()) {
        serializable.push({
          id: room.id,
          name: room.name,
          adminPin: room.adminPin,
          roomPasscode: room.roomPasscode || "",
          qrBypassSecret: room.qrBypassSecret,
          createdAt: room.createdAt,
          lastActive: room.lastActive || room.createdAt || Date.now(),
          settings: room.queueManager.getSettings(),
        });
      }
      fs.writeFileSync(ROOMS_FILE, JSON.stringify(serializable, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to save rooms.json:", err);
    }
  }

  touchRoom(roomId) {
    const room = this.getRoom(roomId);
    if (room) {
      room.lastActive = Date.now();
    }
  }

  generateRoomId(name = "") {
    let clean = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .substring(0, 15);
    
    const randomSuffix = crypto.randomBytes(3).toString("hex");
    if (!clean || clean === "-") {
      return `room-${randomSuffix}`;
    }
    return `${clean}-${randomSuffix}`;
  }

  createRoom({ id, name, adminPin, roomPasscode = "" }) {
    const roomId = (id || this.generateRoomId(name)).toLowerCase().trim();
    if (this.rooms.has(roomId)) {
      throw new Error(`รหัสห้อง "${roomId}" มีอยู่แล้ว กรุณาลองใหม่อีกครั้ง`);
    }

    const qrBypassSecret = crypto.randomBytes(16).toString("hex");
    const qm = new QueueManager(roomId, name || "Restaurant Jukebox");
    const now = Date.now();
    
    const room = {
      id: roomId,
      name: name || "Restaurant Jukebox",
      adminPin: String(adminPin || "1234"),
      roomPasscode: String(roomPasscode || "").trim(),
      qrBypassSecret,
      createdAt: now,
      lastActive: now,
      queueManager: qm,
    };

    qm.onSettingsChange = (newSettings) => {
      room.settings = newSettings;
      this.saveRooms();
    };

    this.rooms.set(roomId, room);
    this.saveRooms();
    console.log(` Created Room [${roomId}]: "${room.name}", Admin PIN: ${room.adminPin}`);
    return room;
  }

  getRoom(roomId) {
    if (!roomId) return null;
    return this.rooms.get(roomId.toLowerCase()) || null;
  }

  deleteRoom(roomId) {
    const target = (roomId || "").toLowerCase().trim();
    if (target === "main") {
      throw new Error("ไม่สามารถลบห้องหลัก (Main Room) ได้");
    }
    if (!this.rooms.has(target)) {
      throw new Error("ไม่พบห้องนี้ในระบบ");
    }

    // Clean up uploaded background if any
    try {
      const bgPath = path.join(__dirname, "uploads", `custom_bg_${target}.jpg`);
      if (fs.existsSync(bgPath)) {
        fs.unlinkSync(bgPath);
      }
    } catch (e) {}

    this.rooms.delete(target);
    this.saveRooms();
    console.log(`🗑️ Deleted Room [${target}] successfully.`);
    return true;
  }

  cleanupInactiveRooms(activeSocketsMap = null) {
    const now = Date.now();
    const toDelete = [];

    for (const [id, room] of this.rooms.entries()) {
      if (id === "main") continue; // Never delete main room

      const qm = room.queueManager;
      // If song is currently playing or queue has songs, consider it active
      if (qm.currentSong && !qm.currentSong.is_house) {
        room.lastActive = now;
        continue;
      }

      const idleDuration = now - (room.lastActive || room.createdAt);
      if (idleDuration >= INACTIVITY_TIMEOUT_MS) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      console.log(`🕒 [Auto-Cleanup] Deleting inactive room [${id}] (Idle > 2 hours)`);
      try {
        this.deleteRoom(id);
      } catch (err) {
        console.error(`Failed to delete room ${id}:`, err);
      }
    }

    return toDelete;
  }

  verifyAccess(roomId, { passcode = "", token = "" } = {}) {
    const room = this.getRoom(roomId);
    if (!room) return { valid: false, error: "ไม่พบห้องนี้ในระบบ" };

    this.touchRoom(roomId);

    if (token && token === room.qrBypassSecret) {
      return { valid: true, bypassed: true, room };
    }

    if (!room.roomPasscode) {
      return { valid: true, bypassed: false, room };
    }

    if (passcode && String(passcode).trim() === room.roomPasscode) {
      return { valid: true, bypassed: false, room };
    }

    return { valid: false, error: "รหัสเข้าห้องไม่ถูกต้อง", roomName: room.name, requiresPasscode: true };
  }

  verifyAdmin(roomId, pin) {
    const room = this.getRoom(roomId);
    if (!room) return { valid: false, error: "ไม่พบห้องนี้" };
    
    // Check room PIN or Super Admin password
    if (String(pin).trim() === room.adminPin || String(pin).trim() === SUPER_ADMIN.password) {
      const adminToken = `admin_token_${roomId}_${crypto.randomBytes(8).toString("hex")}`;
      this.touchRoom(roomId);
      return { valid: true, token: adminToken, room };
    }
    return { valid: false, error: "รหัส PIN ไม่ถูกต้อง" };
  }

  verifySuperAdmin(username, password) {
    if (
      String(username).trim() === SUPER_ADMIN.username &&
      String(password).trim() === SUPER_ADMIN.password
    ) {
      const token = `super_admin_${crypto.randomBytes(16).toString("hex")}`;
      this.superAdminTokens.add(token);
      return { valid: true, token };
    }
    return { valid: false, error: "ชื่อผู้ใช้หรือรหัสผ่าน Super Admin ไม่ถูกต้อง" };
  }

  isSuperAdminToken(token) {
    return this.superAdminTokens.has(token);
  }

  listPublicRooms() {
    const list = [];
    for (const [id, r] of this.rooms.entries()) {
      list.push({
        id: r.id,
        name: r.name,
        requiresPasscode: !!r.roomPasscode,
        currentSong: r.queueManager.currentSong ? {
          title: r.queueManager.currentSong.title,
          artist: r.queueManager.currentSong.artist,
          thumbnail: r.queueManager.currentSong.thumbnail,
        } : null,
        queueCount: r.queueManager.queue.length,
        isPlaying: r.queueManager.isPlaying,
        createdAt: r.createdAt,
        lastActive: r.lastActive || r.createdAt,
      });
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }
}

module.exports = new RoomManager();
