import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import socket from "../socket";
import { 
  Music2, Play, Pause, Trash2, ShieldCheck, LogOut, Disc, Delete, 
  Volume2, VolumeX, RotateCcw, Shuffle, ArrowUp, ArrowDown, Settings, 
  Clock, ShieldAlert, Sparkles, Sliders, Check, QrCode, FastForward, 
  Wifi, ExternalLink, X, Image as ImageIcon, Upload
} from "lucide-react";

const DEFAULT_NO_MUSIC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%23121216'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%238E8E93' dy='.3em' font-family='sans-serif' font-size='26'%3ENo Music Playing%3C/text%3E%3C/svg%3E";

export default function AdminPage({ roomId = "main" }) {
  const [token, setToken] = useState(localStorage.getItem(`admin_token_${roomId}`) || "");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [activeTab, setActiveTab] = useState("queue"); // 'queue' | 'settings'

  const [state, setState] = useState({
    room_name: "Restaurant Jukebox",
    is_accepting_requests: true,
    current_song: null,
    queue: [],
    is_playing: true,
    master_volume: 1,
    max_duration_sec: 360,
    blacklist_keywords: [],
    auto_house_music: true,
    house_genre: "เพลงชิล acoustic ฟังสบาย ร้านอาหาร",
  });

  // Settings form states
  const [houseGenre, setHouseGenre] = useState("");
  const [maxMinutes, setMaxMinutes] = useState(6);
  const [newKeyword, setNewKeyword] = useState("");
  const [blacklist, setBlacklist] = useState([]);
  const [smartAIDJ, setSmartAIDJ] = useState(true);
  const [bgMode, setBgMode] = useState("album_blur"); // 'album_blur' | 'custom_image' | 'dark_minimal'
  const [bgCustomUrl, setBgCustomUrl] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Playback Progress & Seek state
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  // QR Modal & Network info
  const [showQrModal, setShowQrModal] = useState(false);
  const [serverInfo, setServerInfo] = useState(null);
  const [adminQrDataUrl, setAdminQrDataUrl] = useState("");

  useEffect(() => {
    // Join room for socket
    socket.emit("room:join", { roomId, isAdmin: true }, (res) => {
      if (res?.state) setState(res.state);
    });

    fetch(`/api/rooms/${roomId}/info`)
      .then((r) => r.json())
      .then((info) => {
        setServerInfo(info);
        const targetUrl = info.client_url || `${window.location.origin}/${roomId}`;
        QRCode.toDataURL(targetUrl, {
          margin: 1,
          width: 260,
          color: { dark: "#0A0A0A", light: "#ffffff" },
        }).then(setAdminQrDataUrl);
      })
      .catch(() => {});
  }, [roomId]);

  useEffect(() => {
    const onStateUpdate = (newState) => {
      setState(newState);
      setHouseGenre(newState.house_genre || "");
      setMaxMinutes(Math.floor((newState.max_duration_sec || 360) / 60));
      setBlacklist(newState.blacklist_keywords || []);
      if (typeof newState.smart_ai_dj === "boolean") {
        setSmartAIDJ(newState.smart_ai_dj);
      }
      if (newState.bg_mode) {
        setBgMode(newState.bg_mode);
      }
      if (typeof newState.bg_custom_url === "string") {
        setBgCustomUrl(newState.bg_custom_url);
      }
      if (typeof newState.current_time === "number" && !isSeeking) {
        setPlaybackTime(newState.current_time);
      }
      if (typeof newState.duration === "number") {
        setPlaybackDuration(newState.duration);
      }
    };

    const onProgress = (data) => {
      if (!isSeeking) {
        setPlaybackTime(data.currentTime);
        if (data.duration) setPlaybackDuration(data.duration);
      }
    };

    socket.on("state:update", onStateUpdate);
    socket.on("playback:progress", onProgress);

    return () => {
      socket.off("state:update", onStateUpdate);
      socket.off("playback:progress", onProgress);
    };
  }, [isSeeking]);

  const handleDigit = (d) => {
    if (pin.length < 6) {
      const nextPin = pin + d;
      setPin(nextPin);
      if (nextPin.length >= 4) verifyPin(nextPin);
    }
  };

  const verifyPin = async (inputPin) => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: inputPin }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        localStorage.setItem(`admin_token_${roomId}`, data.token);
        setPinError(false);
      } else {
        setPinError(true);
        setPin("");
      }
    } catch {
      setPinError(true);
      setPin("");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(`admin_token_${roomId}`);
    setToken("");
    setPin("");
  };

  // Playback Handlers (ข้อ 1 ทั้งหมด)
  const handleTogglePlay = () => {
    socket.emit("admin:pause-resume", { token, is_playing: !state.is_playing });
  };

  const handleReplay = () => {
    socket.emit("admin:replay", { token });
  };

  const handleSkip = () => {
    socket.emit("song:skip");
  };

  const handleSmoothSkip = () => {
    socket.emit("admin:smooth-skip", { token });
  };

  const handleSeekChange = (e) => {
    setIsSeeking(true);
    setSeekValue(parseFloat(e.target.value));
  };

  const handleSeekEnd = () => {
    setIsSeeking(false);
    setPlaybackTime(seekValue);
    socket.emit("admin:seek", { token, time: seekValue });
  };

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleVolumeChange = (e) => {
    const vol = parseFloat(e.target.value);
    socket.emit("admin:set-volume", { token, volume: vol });
  };

  // Queue Organization Handlers (ข้อ 4 ทั้งหมด)
  const handleMoveUp = (itemId) => {
    socket.emit("admin:move-up", { token, item_id: itemId });
  };

  const handleMoveDown = (itemId) => {
    socket.emit("admin:move-down", { token, item_id: itemId });
  };

  const handleShuffle = () => {
    socket.emit("admin:shuffle", { token });
  };

  const handleClearQueue = () => {
    if (confirm("ต้องการล้างคิวเพลงทั้งหมดใช่ไหม?")) {
      socket.emit("admin:clear", { token });
    }
  };

  const handlePlayNow = (itemId) => {
    socket.emit("admin:play-now", { token, item_id: itemId });
  };

  const handleDelete = (itemId) => {
    socket.emit("admin:delete", { token, item_id: itemId });
  };

  const handleCloseRoom = async () => {
    if (roomId === "main") {
      alert("ห้องหลัก (Main Room) ไม่สามารถปิดได้");
      return;
    }
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการ "ปิดห้องเพลงนี้" ?\nคิวเพลงและข้อมูลของห้องจะถูกลบออกทันที`)) {
      return;
    }

    try {
      const res = await fetch(`/api/rooms/${roomId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        alert("ปิดห้องสำเร็จ กำลังกลับสู่หน้ารวมห้อง");
        window.location.href = "/";
      } else {
        alert(data.message || "ไม่สามารถปิดห้องได้");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
  };

  // Rules & House Music Handlers (ข้อ 2 และระบบเล่นเพลงสำรอง)
  const handleAddKeyword = (e) => {
    e.preventDefault();
    if (newKeyword.trim() && !blacklist.includes(newKeyword.trim())) {
      setBlacklist([...blacklist, newKeyword.trim()]);
      setNewKeyword("");
    }
  };

  const handleRemoveKeyword = (word) => {
    setBlacklist(blacklist.filter((w) => w !== word));
  };

  const [isUploadingBg, setIsUploadingBg] = useState(false);

  const handleBgUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert("กรุณาเลือกไฟล์ภาพขนาดไม่เกิน 50MB");
      return;
    }
    setIsUploadingBg(true);
    const reader = new FileReader();
    reader.onload = async (uploadEvent) => {
      try {
        const base64 = uploadEvent.target.result;
        const res = await fetch(`/api/rooms/${roomId}/admin/upload-bg`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, image_base64: base64, mode: "custom_image" }),
        });
        const data = await res.json();
        if (data.status === "success") {
          setBgCustomUrl(data.bg_custom_url || base64);
          setBgMode("custom_image");
          setSavedSuccess(true);
          setTimeout(() => setSavedSuccess(false), 2500);
        } else {
          alert("อัปโหลดไม่สำเร็จ: " + (data.message || "เกิดข้อผิดพลาด"));
        }
      } catch (err) {
        console.error("Upload bg error:", err);
        alert("อัปโหลดไม่สำเร็จ: " + err.message);
      } finally {
        setIsUploadingBg(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSelectBgMode = (mode) => {
    setBgMode(mode);
    socket.emit("admin:set-bg", { token, bg_mode: mode, bg_custom_url: bgCustomUrl });
  };

  const handleSaveSettings = () => {
    socket.emit("admin:save-rules", {
      token,
      max_duration_sec: maxMinutes * 60,
      blacklist_keywords: blacklist,
      house_genre: houseGenre,
      auto_house_music: state.auto_house_music,
      smart_ai_dj: smartAIDJ,
      bg_mode: bgMode,
      bg_custom_url: bgCustomUrl,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  if (!token) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-2xl p-4">
        <div className="frosted-glass max-w-sm w-full p-8 rounded-3xl text-center space-y-6 shadow-2xl border border-white/10">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-neonViolet to-cyberCyan flex items-center justify-center text-slate-950 shadow-xl shadow-purple-500/25">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white">เข้าสู่ระบบ Admin</h2>
            <p className="text-xs text-mutedGray mt-1">กรอก PIN 4 หลัก (รหัส: 1234)</p>
          </div>

          <div className="flex justify-center space-x-4 py-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                  i < pin.length
                    ? "bg-cyberCyan border-cyberCyan shadow-[0_0_15px_#00F0FF] scale-110"
                    : "border-mutedGray"
                }`}
              />
            ))}
          </div>
          {pinError && <p className="text-xs font-bold text-neonPink">รหัส PIN ไม่ถูกต้อง</p>}

          <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
              <button
                key={num}
                onClick={() => handleDigit(num)}
                className="h-14 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-95 text-xl font-bold transition flex items-center justify-center border border-white/5 text-white"
              >
                {num}
              </button>
            ))}
            <button
              onClick={() => { setPin(""); setPinError(false); }}
              className="h-14 rounded-2xl bg-transparent hover:bg-white/5 text-xs font-bold text-mutedGray transition flex items-center justify-center"
            >
              ล้าง
            </button>
            <button
              onClick={() => handleDigit("0")}
              className="h-14 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-95 text-xl font-bold transition flex items-center justify-center border border-white/5 text-white"
            >
              0
            </button>
            <button
              onClick={() => setPin(pin.slice(0, -1))}
              className="h-14 rounded-2xl bg-transparent hover:bg-white/5 text-mutedGray transition flex items-center justify-center"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-white min-h-screen pb-28 antialiased bg-void selection:bg-neonPink">
      {/* Cockpit Top Bar */}
      <header className="sticky top-0 z-40 bg-void/80 backdrop-blur-2xl border-b border-white/10 px-4 sm:px-8 py-4 flex items-center justify-between shadow-2xl">
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-neonViolet via-neonPink to-cyberCyan p-[1.5px] shadow-lg shadow-purple-500/25">
            <div className="w-full h-full bg-void rounded-2xl flex items-center justify-center">
              <Music2 className="w-5 h-5 text-cyberCyan" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-black text-base text-white tracking-wide">{state.room_name}</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-neonViolet/20 text-cyberCyan border border-cyberCyan/30">
                PRO CONTROL
              </span>
            </div>
            <p className="text-xs text-mutedGray flex items-center space-x-1.5 font-medium mt-0.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyberCyan animate-pulse"></span>
              <span>เชื่อมต่อ Real-time</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <a
            href="/"
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-mutedGray hover:text-white transition border border-white/10 flex items-center space-x-2 text-xs font-bold"
            title="กลับหน้ารวมห้อง"
          >
            <span>หน้ารวมห้อง</span>
          </a>

          <a
            href={`/${roomId}/player`}
            target="_blank"
            rel="noreferrer"
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-cyberCyan hover:text-white transition border border-white/10 flex items-center space-x-2 text-xs font-bold"
            title="เปิดหน้าจอทีวี Player ในแท็บใหม่"
          >
            <span>เปิดจอทีวี</span>
          </a>

          <button
            onClick={() => setShowQrModal(true)}
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-cyberCyan hover:text-white transition border border-white/10 flex items-center space-x-2 text-xs font-bold"
            title="ดู QR Code สำหรับลูกค้า"
          >
            <QrCode className="w-4 h-4" />
            <span className="hidden sm:inline">QR ร้าน</span>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === "queue" ? "settings" : "queue")}
            className={`p-2.5 rounded-2xl border transition flex items-center space-x-2 text-xs font-bold ${
              activeTab === "settings"
                ? "bg-cyberCyan text-black border-cyberCyan shadow-lg shadow-cyan-500/30"
                : "frosted-glass border-white/10 text-white hover:border-white/20"
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">ตั้งค่าร้าน & แนวเพลง</span>
          </button>

          {roomId !== "main" && (
            <button
              onClick={handleCloseRoom}
              className="p-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition border border-rose-500/30 flex items-center space-x-1.5 text-xs font-bold"
              title="ปิดห้องและลบข้อมูลห้องนี้ทิ้ง"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">ปิดห้องนี้</span>
            </button>
          )}

          <button
            onClick={handleLogout}
            title="ออกจากระบบ"
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-mutedGray hover:text-white transition border border-white/5"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Cockpit Container */}
      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">

        {/* 1. MASTER PLAYBACK COCKPIT (ปุ่ม Pause/Play, Replay, Skip, Volume Slider) */}
        <section className="frosted-glass rounded-3xl p-6 relative overflow-hidden neon-glow-violet border border-white/10 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-cyberCyan">
              <span className="w-2 h-2 rounded-full bg-neonPink animate-ping"></span>
              <span>NOW PLAYING {state.current_song?.is_house ? "(เพลงสำรองของร้าน)" : ""}</span>
            </div>

            {/* Master Volume Controller */}
            <div className="flex items-center space-x-3 bg-black/40 px-4 py-2 rounded-2xl border border-white/10 w-fit">
              <Volume2 className="w-4 h-4 text-cyberCyan flex-shrink-0" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={state.master_volume}
                onChange={handleVolumeChange}
                className="w-24 sm:w-32 accent-cyberCyan cursor-pointer h-1.5"
              />
              <span className="text-xs font-mono text-mutedGray w-8 text-right">
                {Math.round(state.master_volume * 100)}%
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
            <img
              src={state.current_song ? state.current_song.thumbnail : DEFAULT_NO_MUSIC}
              alt="Cover"
              className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl object-cover shadow-2xl border-2 border-white/15 bg-cosmic flex-shrink-0"
            />

            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-[11px] text-mutedGray font-bold uppercase tracking-wider">เพลงที่กำลังเปิด</p>
              <h3 className="text-xl sm:text-2xl font-black text-white truncate leading-tight">
                {state.current_song ? state.current_song.title : "ยังไม่มีเพลงที่กำลังเล่น"}
              </h3>
              <p className="text-sm font-bold text-cyberCyan truncate">
                {state.current_song ? state.current_song.artist : "รอเพลงเข้าคิว หรือเปิดเพลงสำรอง"}
              </p>

              {/* Interactive Seek Bar (กอเวลาเพลง) */}
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center space-x-3">
                  <input
                    type="range"
                    min="0"
                    max={playbackDuration || state.current_song?.duration || 100}
                    step="1"
                    value={isSeeking ? seekValue : playbackTime}
                    onChange={handleSeekChange}
                    onMouseUp={handleSeekEnd}
                    onTouchEnd={handleSeekEnd}
                    disabled={!state.current_song}
                    className="flex-1 accent-cyberCyan cursor-pointer h-2 rounded-lg bg-white/10 disabled:opacity-40"
                  />
                </div>
                <div className="flex justify-between text-[11px] font-mono text-mutedGray">
                  <span className="text-cyberCyan font-bold">
                    {formatSeconds(isSeeking ? seekValue : playbackTime)}
                  </span>
                  <span>{formatSeconds(playbackDuration || state.current_song?.duration || 0)}</span>
                </div>
              </div>

              {/* Full Playback Control Buttons (Pause, Resume, Replay, Smooth Fade-Skip, Skip) */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  onClick={handleTogglePlay}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center space-x-2 transition active:scale-95 border border-white/10"
                >
                  {state.is_playing ? <Pause className="w-4 h-4 text-cyberCyan" /> : <Play className="w-4 h-4 text-cyberCyan" />}
                  <span>{state.is_playing ? "หยุดชั่วคราว" : "เล่นต่อ"}</span>
                </button>

                <button
                  onClick={handleReplay}
                  title="เล่นซ้ำเพลงปัจจุบัน"
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition active:scale-95 border border-white/10"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  onClick={handleSmoothSkip}
                  title="ค่อยๆ หรี่เสียงลง 1.2 วินาทีแล้วข้ามเพลงอย่างนุ่มนวล"
                  className="px-3.5 py-2.5 rounded-xl bg-cyberCyan/15 hover:bg-cyberCyan text-cyberCyan hover:text-black font-bold text-xs flex items-center space-x-1.5 transition active:scale-95 border border-cyberCyan/30"
                >
                  <FastForward className="w-4 h-4" />
                  <span>Fade Skip</span>
                </button>

                <button
                  onClick={handleSkip}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-neonPink to-neonViolet hover:opacity-90 text-white font-bold text-xs flex items-center space-x-1.5 transition active:scale-95 shadow-lg shadow-pink-500/25"
                >
                  <span>ข้ามทันที (Skip)</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {activeTab === "queue" ? (
          /* 2. THE QUEUE MANAGER (คิวเพลง + Move Up/Down + Shuffle + Clear All) */
          <section className="space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center space-x-2.5">
                <h2 className="text-base font-black text-white tracking-wide">จัดการคิวเพลง</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-neonViolet/20 text-cyberCyan border border-cyberCyan/30">
                  {state.queue.length} เพลง
                </span>
              </div>

              {/* Queue Controls: Shuffle & Clear All */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleShuffle}
                  disabled={state.queue.length < 2}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-cyberCyan border border-white/10 flex items-center space-x-1.5 disabled:opacity-40 transition active:scale-95"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>สุ่มคิว (Shuffle)</span>
                </button>

                <button
                  onClick={handleClearQueue}
                  disabled={state.queue.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-neonPink/10 hover:bg-neonPink/20 text-xs font-bold text-neonPink border border-neonPink/30 flex items-center space-x-1.5 disabled:opacity-40 transition active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>ล้างคิวทั้งหมด</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {state.queue.length === 0 ? (
                <div className="frosted-glass rounded-3xl p-12 text-center border border-dashed border-white/10">
                  <Disc className="w-10 h-10 mx-auto text-mutedGray mb-2 animate-spin" style={{ animationDuration: "8s" }} />
                  <p className="text-sm font-bold text-white">คิวว่าง (ระบบเปิดเพลงสำรองของร้านอัตโนมัติ)</p>
                  <p className="text-xs text-stone-500 mt-1">เมื่อมีลูกค้าขอเพลงใหม่ เพลงจะขึ้นเป็นคิวถัดไปทันที</p>
                </div>
              ) : (
                state.queue.map((item, index) => {
                  const isFirst = index === 0;
                  return (
                    <div
                      key={item.id}
                      className={`frosted-glass rounded-2xl p-4 flex items-center space-x-4 transition shadow-md ${
                        isFirst
                          ? "border-cyberCyan/50 bg-gradient-to-r from-neonViolet/20 to-cyberCyan/20"
                          : "hover:border-white/20"
                      }`}
                    >
                      <div className={`w-7 text-center font-black text-sm ${isFirst ? "text-cyberCyan" : "text-neonPink"} flex-shrink-0`}>
                        #{index + 1}
                      </div>

                      <img
                        src={item.thumbnail}
                        alt=""
                        className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 bg-cosmic border border-white/10 shadow-md"
                      />

                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white truncate leading-snug">{item.title}</h4>
                        <p className="text-xs text-mutedGray truncate mt-0.5">{item.artist}</p>
                      </div>

                      {/* Actions: Move Up / Down, Play Now, Delete */}
                      <div className="flex items-center space-x-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleMoveUp(item.id)}
                          disabled={index === 0}
                          title="เลื่อนขึ้น"
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-mutedGray hover:text-white disabled:opacity-20 transition"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMoveDown(item.id)}
                          disabled={index === state.queue.length - 1}
                          title="เลื่อนลง"
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-mutedGray hover:text-white disabled:opacity-20 transition"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handlePlayNow(item.id)}
                          title="เล่นเพลงนี้ทันที"
                          className="p-2 rounded-xl bg-cyberCyan/15 hover:bg-cyberCyan text-cyberCyan hover:text-black font-bold transition active:scale-95"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          title="ลบคิวนี้"
                          className="p-2 rounded-xl bg-neonPink/15 hover:bg-neonPink text-neonPink hover:text-white transition active:scale-95"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        ) : (
          /* 3. STORE RULES & HOUSE PLAYLIST SETTINGS */
          <section className="frosted-glass rounded-3xl p-6 space-y-6 border border-white/10 shadow-2xl">
            <div className="flex items-center space-x-3 pb-3 border-b border-white/10">
              <Sliders className="w-5 h-5 text-cyberCyan" />
              <div>
                <h2 className="text-base font-black text-white">ตั้งค่าร้าน & คุมโทนแนวเพลง</h2>
                <p className="text-xs text-mutedGray">คุมบรรยากาศร้าน ไม่ให้มีเพลงหลุดแนว หรือคลิปยาวเกินไป</p>
              </div>
            </div>

            {/* Smart AI DJ & Related Track Seed Toggle */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-neonViolet/10 via-cyberCyan/10 to-transparent border border-cyberCyan/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-cyberCyan/20 flex items-center justify-center text-cyberCyan">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-white">Smart AI DJ (Related Track Seed & Anti-Repeat)</h3>
                    <p className="text-[11px] text-mutedGray">ต่อยอดเพลงอัตโนมัติตามศิลปินและมู้ดที่ลูกค้าเพิ่งขอ พร้อมระบบจำเพลงกันเปิดซ้ำ</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSmartAIDJ(!smartAIDJ)}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                    smartAIDJ ? "bg-cyberCyan" : "bg-white/10"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      smartAIDJ ? "translate-x-6 bg-slate-950" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              <p className="text-[10px] text-cyberCyan/80 font-mono">
                {smartAIDJ
                  ? "✓ เปิดใช้งาน: AI DJ จะวิเคราะห์เพลงล่าสุดของลูกค้า แล้วดึงเพลงแนวเดียวกันมาเปิดต่อเมื่อคิวหมด"
                  : "✕ ปิดใช้งาน: ใช้เฉพาะคำค้นหาแนวเพลงร้านทั่วไป"}
              </p>
            </div>

            {/* House Genre Selection (ระบบเล่นเพลงต่อตอนคิวว่าง ไม่ให้หลุดแนว) */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-white flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-cyberCyan" />
                <span>แนวเพลงสำรองของร้าน (House Vibe เมื่อคิวว่าง):</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  "เพลงชิล acoustic ฟังสบาย ร้านอาหาร",
                  "jazz bossa nova ร้านกาแฟ บาร์นั่งชิล",
                  "indie pop r&b สากลฟังสบาย",
                  "lofi hip hop chill beats relax"
                ].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setHouseGenre(g)}
                    className={`p-2.5 rounded-xl text-[11px] font-bold border text-left transition ${
                      houseGenre === g
                        ? "bg-cyberCyan/20 border-cyberCyan text-cyberCyan shadow-md"
                        : "bg-white/5 border-white/10 text-mutedGray hover:text-white"
                    }`}
                  >
                    {g.split(" ")[0]} {g.split(" ")[1]}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={houseGenre}
                onChange={(e) => setHouseGenre(e.target.value)}
                placeholder="หรือพิมพ์คีย์เวิร์ดแนวเพลงของร้านเอง..."
                className="w-full bg-cosmic border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-cyberCyan"
              />
            </div>

            {/* Max Duration Limit (จำกัดความยาวเพลง) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-white flex items-center space-x-2">
                <Clock className="w-4 h-4 text-cyberCyan" />
                <span>จำกัดความยาวเพลงสูงสุดต่อ 1 เพลง:</span>
              </label>
              <div className="flex items-center space-x-3">
                {[4, 5, 6, 8, 10].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMaxMinutes(m)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                      maxMinutes === m
                        ? "bg-gradient-to-r from-neonViolet to-cyberCyan border-cyberCyan text-white"
                        : "bg-white/5 border-white/10 text-mutedGray hover:text-white"
                    }`}
                  >
                    {m} นาที
                  </button>
                ))}
              </div>
            </div>

            {/* Blacklist Keywords (คำต้องห้าม / กรองแนวเพลง) */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-white flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-neonPink" />
                <span>คำต้องห้าม / กรองชื่อเพลง (Blacklist Keywords):</span>
              </label>

              <form onSubmit={handleAddKeyword} className="flex space-x-2">
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="พิมพ์คำที่ไม่อนุญาต เช่น สารคดี, 10 hour..."
                  className="flex-1 bg-cosmic border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-neonPink"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-neonPink/20 text-neonPink border border-neonPink/30 font-bold text-xs hover:bg-neonPink hover:text-white transition"
                >
                  + เพิ่มคำ
                </button>
              </form>

              <div className="flex flex-wrap gap-2 pt-1">
                {blacklist.map((word) => (
                  <span
                    key={word}
                    className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200"
                  >
                    <span>{word}</span>
                    <button
                      onClick={() => handleRemoveKeyword(word)}
                      className="text-neonPink hover:text-white ml-1 text-sm font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Background Customization (เปลี่ยนภาพพื้นหลังหน้าจอ Player / TV) */}
            <div className="space-y-3 pt-3 border-t border-white/10">
              <label className="text-xs font-bold text-white flex items-center space-x-2">
                <ImageIcon className="w-4 h-4 text-cyberCyan" />
                <span>ภาพพื้นหลังหน้าจอแสดงผล (Player / TV Screen Background):</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSelectBgMode("album_blur")}
                  className={`p-3 rounded-2xl border text-left transition flex flex-col space-y-1 ${
                    bgMode === "album_blur"
                      ? "bg-cyberCyan/20 border-cyberCyan text-white shadow-md shadow-cyan-500/10"
                      : "bg-white/5 border-white/10 text-mutedGray hover:text-white"
                  }`}
                >
                  <span className="text-xs font-bold flex items-center space-x-1.5">
                    <span>✨ Blur ตามปกเพลง</span>
                  </span>
                  <span className="text-[10px] opacity-75">เบลอสีสันตามปกเพลงที่กำลังเล่น อัตโนมัติ</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectBgMode("custom_image")}
                  className={`p-3 rounded-2xl border text-left transition flex flex-col space-y-1 ${
                    bgMode === "custom_image"
                      ? "bg-cyberCyan/20 border-cyberCyan text-white shadow-md shadow-cyan-500/10"
                      : "bg-white/5 border-white/10 text-mutedGray hover:text-white"
                  }`}
                >
                  <span className="text-xs font-bold flex items-center space-x-1.5">
                    <span>🖼️ ภาพพื้นหลังของร้าน</span>
                  </span>
                  <span className="text-[10px] opacity-75">ใช้วอลเปเปอร์/ภาพบรรยากาศร้านที่อัปโหลด</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectBgMode("dark_minimal")}
                  className={`p-3 rounded-2xl border text-left transition flex flex-col space-y-1 ${
                    bgMode === "dark_minimal"
                      ? "bg-cyberCyan/20 border-cyberCyan text-white shadow-md shadow-cyan-500/10"
                      : "bg-white/5 border-white/10 text-mutedGray hover:text-white"
                  }`}
                >
                  <span className="text-xs font-bold flex items-center space-x-1.5">
                    <span>🌑 โหมด Dark เรียบหรู</span>
                  </span>
                  <span className="text-[10px] opacity-75">โทนสีดำ Deep Slate เรียบสบายตา</span>
                </button>
              </div>

              {/* Upload Input & Preview */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  {bgCustomUrl ? (
                    <img
                      src={bgCustomUrl}
                      alt="Preview"
                      className="w-14 h-14 rounded-xl object-cover border border-white/20 shadow flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-mutedGray flex-shrink-0">
                      <ImageIcon className="w-6 h-6 opacity-40" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white">
                      {bgCustomUrl ? "มีภาพวอลเปเปอร์ร้านแล้ว" : "ยังไม่ได้อัปโหลดภาพ"}
                    </p>
                    <p className="text-[10px] text-mutedGray">รองรับไฟล์ JPG, PNG ความละเอียดสูง (ขนาดไฟล์สูงสุด 50MB)</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                  <label className={`cursor-pointer px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center space-x-1.5 transition active:scale-95 ${
                    isUploadingBg
                      ? "bg-white/10 border-white/20 text-mutedGray pointer-events-none animate-pulse"
                      : "bg-cyberCyan/20 hover:bg-cyberCyan/30 border-cyberCyan/40 text-cyberCyan"
                  }`}>
                    <Upload className={`w-3.5 h-3.5 ${isUploadingBg ? "animate-spin" : ""}`} />
                    <span>{isUploadingBg ? "กำลังอัปโหลด..." : "อัปโหลดภาพใหม่"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleBgUpload}
                      disabled={isUploadingBg}
                      className="hidden"
                    />
                  </label>

                  {bgCustomUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setBgCustomUrl("");
                        setBgMode("album_blur");
                        fetch("/api/admin/upload-bg", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ token, image_base64: "", mode: "album_blur" }),
                        }).catch(() => {});
                      }}
                      className="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-mutedGray hover:text-neonPink text-xs transition"
                      title="ลบภาพพื้นหลัง"
                    >
                      ลบภาพ
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-3 flex justify-end">
              <button
                onClick={handleSaveSettings}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-neonViolet via-neonPink to-cyberCyan hover:opacity-95 text-white font-black text-xs transition active:scale-95 flex items-center space-x-2 shadow-xl shadow-purple-500/25"
              >
                {savedSuccess ? <Check className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4" />}
                <span>{savedSuccess ? "บันทึกกฎเรียบร้อย!" : "บันทึกการตั้งค่าร้าน"}</span>
              </button>
            </div>
          </section>
        )}

      </main>

      {/* QR Code Modal for Counter / Store Display */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-4">
          <div className="frosted-glass max-w-sm w-full p-6 rounded-3xl text-center space-y-5 border border-white/20 shadow-2xl relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-mutedGray hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-white flex items-center justify-center space-x-2">
                <QrCode className="w-5 h-5 text-cyberCyan" />
                <span>QR Code สแกนขอเพลง</span>
              </h3>
              <p className="text-xs text-mutedGray">
                วางไว้ที่เคาน์เตอร์ หรือให้ลูกค้าสแกนผ่านมือถือ
              </p>
            </div>

            <div className="p-4 bg-white rounded-3xl shadow-2xl inline-block mx-auto border-4 border-cyberCyan/30">
              {adminQrDataUrl ? (
                <img src={adminQrDataUrl} alt="Store QR Code" className="w-48 h-48 mx-auto" />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-xs text-gray-500">กำลังโหลด...</div>
              )}
            </div>

            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1.5 text-left text-xs">
              <div className="flex items-center space-x-2 text-cyberCyan font-bold">
                <Wifi className="w-3.5 h-3.5" />
                <span>คำแนะนำการเชื่อมต่อ Wi-Fi ร้าน</span>
              </div>
              <p className="text-[11px] text-mutedGray leading-relaxed">
                โทรศัพท์ของลูกค้าและคอมพิวเตอร์เครื่องนี้ต้องต่อ Wi-Fi ร้านวงเดียวกัน
              </p>
              <div className="pt-1 flex items-center justify-between font-mono text-[11px] text-white">
                <span className="truncate">{serverInfo?.client_url || window.location.origin}</span>
                <a
                  href={serverInfo?.client_url || "/"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyberCyan hover:underline flex items-center space-x-1 flex-shrink-0 ml-2"
                >
                  <span>เปิดดู</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
