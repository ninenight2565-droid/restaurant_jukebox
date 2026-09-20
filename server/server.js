const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const os = require("os");
const fs = require("fs");

const roomManager = require("./roomManager");
const { getDirectAudioUrl } = require("./audioExtractor");
const { searchYouTube } = require("./searchEngine");
const aiDjCurator = require("./aiDjCurator");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT || 8888;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

// Store active admin sessions: token -> { roomId, createdAt }
const adminSessions = new Map();

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  let candidate = "127.0.0.1";
  for (let devName in interfaces) {
    const isWifiOrEth = /wi-fi|ethernet|wlan|lan/i.test(devName);
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === "IPv4" && alias.address !== "127.0.0.1" && !alias.internal) {
        if (isWifiOrEth && !/vethernet/i.test(devName)) {
          return alias.address;
        }
        candidate = alias.address;
      }
    }
  }
  return candidate;
}

const LOCAL_IP = getLocalIP();

function broadcastRoomState(roomId, eventType = "state:update") {
  const room = roomManager.getRoom(roomId);
  if (!room) return;
  const state = room.queueManager.getFullState();
  io.to(roomId).emit(eventType, state);
}

// Auto-fill House Music / Smart AI DJ if a room queue is empty
async function handleEmptyQueueHouseMusic(room) {
  const qm = room.queueManager;
  if (!qm.autoHouseMusic) return;
  if (qm.queue.length > 0) return;

  try {
    const seedSong = qm.smartAIDJ ? qm.lastUserSong : null;
    console.log(`🎵 [${room.id} Queue Empty] Finding next smart song... Seed: ${seedSong ? seedSong.title : "None"}`);

    const result = await aiDjCurator.getNextSmartTrack({
      seedSong,
      houseGenre: qm.houseGenre,
      maxDurationSec: qm.maxDurationSec,
    });

    if (result && result.song) {
      const s = result.song;
      console.log(`✨ [${room.id} AI DJ Selected]: "${s.title}" (${s.artist}) [Reason: ${result.reason}]`);

      qm.currentSong = {
        id: "house_" + Math.random().toString(36).substring(2, 9),
        video_id: s.video_id,
        title: s.title,
        artist: s.artist || "ศิลปิน",
        duration: s.duration,
        duration_str: s.duration_str,
        thumbnail: s.thumbnail,
        user_name: "",
        table_no: "",
        is_house: true,
        ai_curated: true,
        curation_reason: result.reason,
      };
      qm.isPlaying = true;
      broadcastRoomState(room.id, "state:update");
    }
  } catch (err) {
    console.error(`[${room.id}] Error fetching house music:`, err);
  }
}

// ==================== REST APIs ====================

// 1. System & Network info
app.get("/api/info", (req, res) => {
  const host = req.headers.host || `${LOCAL_IP}:${PORT}`;
  const protocol = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
  const baseUrl = `${protocol}://${host}`;

  res.json({
    local_ip: LOCAL_IP,
    port: PORT,
    base_url: baseUrl,
  });
});

// 2. Room endpoints
app.get("/api/rooms", (req, res) => {
  res.json({ status: "success", rooms: roomManager.listPublicRooms() });
});

app.post("/api/rooms/create", (req, res) => {
  try {
    const { name, admin_pin, room_passcode } = req.body;
    if (!admin_pin || String(admin_pin).length < 4) {
      return res.status(400).json({ status: "error", message: "กรุณากำหนดรหัส Admin PIN อย่างน้อย 4 หลัก" });
    }
    const room = roomManager.createRoom({
      name: name || "Music Room",
      adminPin: admin_pin,
      roomPasscode: room_passcode || "",
    });

    // Automatically create admin session for the room creator
    const adminRes = roomManager.verifyAdmin(room.id, admin_pin);
    if (adminRes.valid) {
      adminSessions.set(adminRes.token, { roomId: room.id, createdAt: Date.now() });
    }

    res.json({
      status: "success",
      room_id: room.id,
      room_name: room.name,
      admin_token: adminRes.token || "",
      qr_bypass_secret: room.qrBypassSecret,
    });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

// Verify Room User Access (Supports QR token bypass & Passcode)
app.post("/api/rooms/:roomId/verify", (req, res) => {
  const { roomId } = req.params;
  const { passcode, token } = req.body;

  const result = roomManager.verifyAccess(roomId, { passcode, token });
  if (result.valid) {
    return res.json({
      status: "success",
      bypassed: !!result.bypassed,
      room_name: result.room.name,
      room_id: result.room.id,
    });
  } else {
    return res.status(401).json({
      status: "error",
      message: result.error,
      requires_passcode: !!result.requiresPasscode,
      room_name: result.roomName || "",
    });
  }
});

// Room Details and Player URLs
app.get("/api/rooms/:roomId/info", (req, res) => {
  const { roomId } = req.params;
  const room = roomManager.getRoom(roomId);
  if (!room) {
    return res.status(404).json({ status: "error", message: "ไม่พบห้องนี้" });
  }

  const host = req.headers.host || `${LOCAL_IP}:${PORT}`;
  const protocol = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
  const baseUrl = `${protocol}://${host}`;

  // QR URL contains the qrBypassSecret in query parameter ?t=...
  const qrUserUrl = `${baseUrl}/${room.id}?t=${room.qrBypassSecret}`;

  res.json({
    status: "success",
    room_id: room.id,
    room_name: room.name,
    requires_passcode: !!room.roomPasscode,
    client_url: qrUserUrl,
    direct_url: `${baseUrl}/${room.id}`,
    player_url: `${baseUrl}/${room.id}/player`,
    admin_url: `${baseUrl}/${room.id}/admin`,
    qr_bypass_secret: room.qrBypassSecret,
  });
});

// Admin Login for specific room
app.post("/api/rooms/:roomId/admin/login", (req, res) => {
  const { roomId } = req.params;
  const { pin } = req.body;
  const result = roomManager.verifyAdmin(roomId, pin);
  if (result.valid) {
    adminSessions.set(result.token, { roomId: result.room.id, createdAt: Date.now() });
    return res.json({ status: "success", token: result.token, room_name: result.room.name });
  }
  return res.status(401).json({ status: "error", message: "PIN ไม่ถูกต้องสำหรับห้องนี้" });
});

// Admin Upload Background per Room
app.post("/api/rooms/:roomId/admin/upload-bg", (req, res) => {
  const { roomId } = req.params;
  const { token, image_base64, mode } = req.body;

  const session = adminSessions.get(token);
  if (!session || session.roomId !== roomId.toLowerCase()) {
    return res.status(401).json({ status: "error", message: "Unauthorized admin session" });
  }

  const room = roomManager.getRoom(roomId);
  if (!room) return res.status(404).json({ status: "error", message: "Room not found" });

  const bgMode = mode || "custom_image";
  if (image_base64 && image_base64.includes("base64,")) {
    try {
      const base64Data = image_base64.split("base64,")[1];
      const filename = `custom_bg_${room.id}.jpg`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
      const publicUrl = `/uploads/${filename}?v=${Date.now()}`;
      room.queueManager.setBackground(bgMode, publicUrl);
      broadcastRoomState(room.id, "state:update");
      return res.json({ status: "success", bg_mode: room.queueManager.bgMode, bg_custom_url: publicUrl });
    } catch (err) {
      console.error("Error saving background image:", err);
      return res.status(500).json({ status: "error", message: "Failed to save image" });
    }
  } else if (!image_base64) {
    room.queueManager.setBackground(bgMode, "");
    broadcastRoomState(room.id, "state:update");
    return res.json({ status: "success", bg_mode: room.queueManager.bgMode, bg_custom_url: "" });
  }

  room.queueManager.setBackground(bgMode, image_base64);
  broadcastRoomState(room.id, "state:update");
  res.json({ status: "success", bg_mode: room.queueManager.bgMode, bg_custom_url: room.queueManager.bgCustomUrl });
});

// Super Admin Login (jetwit / 704658009zxczZ)
app.post("/api/admin/super-login", (req, res) => {
  const { username, password } = req.body;
  const result = roomManager.verifySuperAdmin(username, password);
  if (result.valid) {
    return res.json({ status: "success", token: result.token });
  }
  return res.status(401).json({ status: "error", message: result.error });
});

// Delete / Close Room (by Room Admin or Super Admin)
app.post("/api/rooms/:roomId/delete", (req, res) => {
  const { roomId } = req.params;
  const { token, super_token } = req.body;

  const isSuper = super_token && roomManager.isSuperAdminToken(super_token);
  const session = adminSessions.get(token);
  const isRoomAdmin = session && session.roomId === roomId.toLowerCase();

  if (!isSuper && !isRoomAdmin) {
    return res.status(401).json({ status: "error", message: "ไม่มีสิทธิ์ในการลบห้องนี้" });
  }

  try {
    // Notify all connected sockets in that room that the room is closed
    io.to(roomId.toLowerCase()).emit("room:deleted", {
      message: "ห้องนี้ถูกปิดการใช้งานแล้ว กำลังกลับสู่หน้ารวมห้อง...",
    });

    roomManager.deleteRoom(roomId);
    return res.json({ status: "success", message: `ลบห้อง ${roomId} เรียบร้อยแล้ว` });
  } catch (err) {
    return res.status(400).json({ status: "error", message: err.message });
  }
});

// Search & YouTube Queries
app.get("/api/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  const results = await searchYouTube(q, 12);
  res.json(results);
});

app.get("/api/suggest", (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  const https = require("https");
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`;
  https.get(url, (apiRes) => {
    let raw = "";
    apiRes.on("data", (chunk) => { raw += chunk; });
    apiRes.on("end", () => {
      try {
        const parsed = JSON.parse(raw);
        const suggestions = (parsed && parsed[1]) ? parsed[1].slice(0, 6) : [];
        res.json(suggestions);
      } catch (e) {
        res.json([]);
      }
    });
  }).on("error", () => {
    res.json([]);
  });
});

// Recommendations Endpoint (Room Scoped)
app.get("/api/rooms/:roomId/recommendations", async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = roomManager.getRoom(roomId);
    const qm = room ? room.queueManager : null;

    const videoId = req.query.videoId || qm?.currentSong?.video_id || qm?.lastUserSong?.video_id;
    const page = parseInt(req.query.page) || 1;
    let list = [];

    if (videoId) {
      list = await aiDjCurator.fetchSeedRadioTracks(videoId);
    }

    if (!list || list.length < 5) {
      const seedTitle = qm?.currentSong?.artist || qm?.currentSong?.title || qm?.houseGenre || "เพลงฮิต ร้านอาหาร";
      const extraTracks = await searchYouTube(`เพลงฮิต ${seedTitle} official mv`, 15);
      list = [...(list || []), ...extraTracks];
    }

    const unique = [];
    const seen = new Set();
    for (const item of list) {
      if (item && item.video_id && !seen.has(item.video_id)) {
        seen.add(item.video_id);
        unique.push(item);
      }
    }

    const limit = 8;
    const startIndex = (page - 1) * limit;
    const paginated = unique.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < unique.length;

    res.json({
      status: "success",
      page,
      has_more: hasMore,
      seed_song: qm?.currentSong || qm?.lastUserSong || null,
      recommendations: paginated,
    });
  } catch (err) {
    console.error("Recommendations error:", err);
    res.json({ status: "error", recommendations: [], has_more: false });
  }
});

// Audio streaming direct extraction
app.get("/api/audio-url/:videoId", async (req, res) => {
  try {
    const directUrl = await getDirectAudioUrl(req.params.videoId);
    res.json({ status: "success", audio_url: directUrl });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ==================== Real-time Socket.io ====================

io.on("connection", (socket) => {
  // Client joins a room
  socket.on("room:join", ({ roomId, passcode = "", token = "", isPlayer = false, isAdmin = false }, callback) => {
    const targetRoomId = (roomId || "main").toLowerCase();
    const room = roomManager.getRoom(targetRoomId);

    if (!room) {
      if (callback) callback({ status: "error", message: "ไม่พบห้องนี้ในระบบ" });
      return;
    }

    // If player screen: allow directly
    // If admin screen: allow connect, commands still check admin session token
    // If user screen: verify passcode or QR bypass token
    if (!isPlayer && !isAdmin) {
      const access = roomManager.verifyAccess(targetRoomId, { passcode, token });
      if (!access.valid) {
        if (callback) callback({ status: "error", message: access.error, requiresPasscode: !!access.requiresPasscode });
        return;
      }
    }

    // Leave previous rooms if any
    if (socket.roomId && socket.roomId !== targetRoomId) {
      socket.leave(socket.roomId);
    }

    socket.roomId = targetRoomId;
    socket.join(targetRoomId);

    const fullState = room.queueManager.getFullState();
    socket.emit("state:update", fullState);

    if (callback) {
      callback({
        status: "success",
        room_name: room.name,
        room_id: room.id,
        state: fullState,
      });
    }
  });

  // Song Request Scoped to Room
  socket.on("song:request", (data, callback) => {
    const roomId = socket.roomId || (data.roomId ? data.roomId.toLowerCase() : "main");
    const room = roomManager.getRoom(roomId);
    if (!room) {
      if (callback) callback({ status: "error", message: "ไม่พบห้อง" });
      return;
    }

    try {
      const result = room.queueManager.addToQueue(
        data.song_info,
        data.user_name || "",
        data.table_no || "",
        data.user_id || ""
      );
      broadcastRoomState(roomId, "state:update");

      io.to(roomId).emit("toast:new-song", {
        title: data.song_info.title,
        artist: data.song_info.artist || "ศิลปิน",
        thumbnail: data.song_info.thumbnail,
        autoPlayed: result.autoPlayed,
      });

      if (callback) callback({ status: "success", result });
    } catch (err) {
      if (callback) callback({ status: "error", message: err.message });
    }
  });

  // Skip / End Song Scoped to Room
  socket.on("song:skip", async () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const nextSong = room.queueManager.skipSong();
    if (!nextSong) {
      await handleEmptyQueueHouseMusic(room);
    } else {
      broadcastRoomState(roomId, "state:update");
    }
  });

  // Helper to verify admin token for socket actions
  const verifyAdminSocket = (token) => {
    const session = adminSessions.get(token);
    if (!session || !socket.roomId) return false;
    return session.roomId === socket.roomId;
  };

  // Admin socket controls
  socket.on("admin:play-now", (data) => {
    if (!verifyAdminSocket(data.token)) return;
    const room = roomManager.getRoom(socket.roomId);
    if (room) {
      room.queueManager.playNow(data.item_id);
      broadcastRoomState(socket.roomId, "state:update");
    }
  });

  socket.on("admin:delete", (data) => {
    if (!verifyAdminSocket(data.token)) return;
    const room = roomManager.getRoom(socket.roomId);
    if (room) {
      room.queueManager.removeFromQueue(data.item_id);
      broadcastRoomState(socket.roomId, "state:update");
    }
  });

  socket.on("admin:pause-resume", (data) => {
    if (!verifyAdminSocket(data.token)) return;
    const room = roomManager.getRoom(socket.roomId);
    if (room) {
      room.queueManager.setPlaying(data.is_playing);
      broadcastRoomState(socket.roomId, "state:update");
      io.to(socket.roomId).emit("player:control", { action: data.is_playing ? "play" : "pause" });
    }
  });

  socket.on("admin:replay", (data) => {
    if (!verifyAdminSocket(data.token)) return;
    io.to(socket.roomId).emit("player:control", { action: "replay" });
  });

  socket.on("admin:seek", (data) => {
    if (!verifyAdminSocket(data.token)) return;
    const room = roomManager.getRoom(socket.roomId);
    if (room) {
      const time = parseFloat(data.time) || 0;
      room.queueManager.setProgress(time, room.queueManager.duration);
      io.to(socket.roomId).emit("player:control", { action: "seek", time });
    }
  });

  socket.on("admin:smooth-skip", (data) => {
    if (!verifyAdminSocket(data.token)) return;
    io.to(socket.roomId).emit("player:control", { action: "smooth-skip" });
  });

  // Player report progress back to its specific room
  socket.on("player:progress", (data) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = roomManager.getRoom(roomId);
    if (room) {
      room.queueManager.setProgress(data.currentTime, data.duration);
      socket.to(roomId).emit("playback:progress", {
        currentTime: data.currentTime,
        duration: data.duration,
      });
    }
  });

  socket.on("admin:set-volume", (data) => {
    if (!verifyAdminSocket(data.token)) return;
    const room = roomManager.getRoom(socket.roomId);
    if (room) {
      room.queueManager.setVolume(data.volume);
      broadcastRoomState(socket.roomId, "state:update");
      io.to(socket.roomId).emit("player:control", { action: "volume", volume: room.queueManager.masterVolume });
    }
  });

  socket.on("admin:move-up", (data) => {
    if (!verifyAdminSocket(data.token)) return;
    const room = roomManager.getRoom(socket.roomId);
    if (room) {
      room.queueManager.moveUp(data.item_id);
      broadcastRoomState(socket.roomId, "state:update");
    }
  });

  socket.on("admin:move-down", (data) => {
    if (!verifyAdminSocket(data.token)) return;
    const room = roomManager.getRoom(socket.roomId);
    if (room) {
      room.queueManager.moveDown(data.item_id);
      broadcastRoomState(socket.roomId, "state:update");
    }
  });

  socket.on("admin:shuffle", (data) => {
    if (!verifyAdminSocket(data.token)) return;
    const room = roomManager.getRoom(socket.roomId);
    if (room) {
      room.queueManager.shuffleQueue();
      broadcastRoomState(socket.roomId, "state:update");
    }
  });

  socket.on("admin:clear", (data) => {
    if (!verifyAdminSocket(data.token)) return;
    const room = roomManager.getRoom(socket.roomId);
    if (room) {
      room.queueManager.clearQueue();
      broadcastRoomState(socket.roomId, "state:update");
    }
  });

  socket.on("admin:toggle-accept", (data) => {
    if (!verifyAdminSocket(data.token)) return;
    const room = roomManager.getRoom(socket.roomId);
    if (room) {
      room.queueManager.isAcceptingRequests = data.status;
      broadcastRoomState(socket.roomId, "state:update");
    }
  });

  socket.on("admin:save-rules", (data) => {
    if (!verifyAdminSocket(data.token)) return;
    const room = roomManager.getRoom(socket.roomId);
    if (room) {
      const qm = room.queueManager;
      if (data.max_duration_sec) qm.setMaxDuration(data.max_duration_sec);
      if (data.blacklist_keywords) qm.setBlacklist(data.blacklist_keywords);
      if (data.house_genre) qm.setHouseGenre(data.house_genre);
      if (typeof data.auto_house_music === "boolean") qm.setAutoHouse(data.auto_house_music);
      if (typeof data.smart_ai_dj === "boolean") qm.setSmartAIDJ(data.smart_ai_dj);
      if (data.bg_mode) qm.setBackground(data.bg_mode, data.bg_custom_url);
      broadcastRoomState(socket.roomId, "state:update");
    }
  });
});

// Serve frontend in production
const clientDist = path.join(__dirname, "../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`=========================================`);
  console.log(`🚀 Multi-Room Restaurant Jukebox is Online!`);
  console.log(`📡 Local Network: http://${LOCAL_IP}:${PORT}`);
  console.log(`💻 Localhost:     http://localhost:${PORT}`);
  console.log(`=========================================`);
});
