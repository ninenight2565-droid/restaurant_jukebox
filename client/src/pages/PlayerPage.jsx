import React, { useState, useEffect, useRef } from "react";
import socket from "../socket";
import QRCode from "qrcode";
import { 
  Disc3, Scan, ListMusic, Play, Pause, Volume2, VolumeX, 
  Search, Users, Settings, Sparkles, ChevronRight, ChevronLeft,
  Radio, Maximize2, Minimize2, QrCode, RotateCcw, SkipForward, 
  SlidersHorizontal, X, Music2
} from "lucide-react";

const DEFAULT_COVER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'%3E%3Crect width='600' height='600' fill='%23121216'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%238E8E93' dy='.3em' font-family='sans-serif' font-size='32'%3EWaiting for Music%3C/text%3E%3C/svg%3E";

export default function PlayerPage({ roomId = "main" }) {
  const [state, setState] = useState({
    room_name: "Restaurant Jukebox",
    current_song: null,
    queue: [],
    master_volume: 1,
  });
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [clock, setClock] = useState("");
  const [audioLoading, setAudioLoading] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [songToast, setSongToast] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef(null);
  const currentLoadedVideoId = useRef(null);
  const toastTimeout = useRef(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const [serverInfo, setServerInfo] = useState(null);

  useEffect(() => {
    // Join socket room
    socket.emit("room:join", { roomId, isPlayer: true }, (res) => {
      if (res?.state) setState(res.state);
    });

    // Fetch room network info to generate QR code with bypass token
    fetch(`/api/rooms/${roomId}/info`)
      .then((res) => res.json())
      .then((info) => {
        setServerInfo(info);
        // client_url contains ?t=qrBypassSecret
        const targetUrl = info.client_url || `${window.location.origin}/${roomId}`;
        QRCode.toDataURL(targetUrl, {
          margin: 1,
          width: 180,
          color: { dark: "#0A0A0A", light: "#ffffff" },
        }).then(setQrDataUrl);
      })
      .catch(() => {
        QRCode.toDataURL(`${window.location.origin}/${roomId}`, {
          margin: 1,
          width: 180,
          color: { dark: "#0A0A0A", light: "#ffffff" },
        }).then(setQrDataUrl);
      });
  }, [roomId]);

  // Dual Audio Elements for Seamless Crossfade
  const audioA = useRef(null);
  const audioB = useRef(null);
  const activeDeck = useRef("A"); // "A" | "B"
  const crossfadeInterval = useRef(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const getActiveAudio = () => (activeDeck.current === "A" ? audioA.current : audioB.current);

  // Listen to state update & remote player commands from Admin
  useEffect(() => {
    const onStateUpdate = (newState) => {
      setState(newState);
      const active = getActiveAudio();
      if (active && typeof newState.master_volume === "number") {
        active.volume = newState.master_volume;
      }
    };

    const onPlayerControl = (cmd) => {
      const active = getActiveAudio();
      if (!active) return;
      if (cmd.action === "pause") {
        active.pause();
        setIsPlaying(false);
      } else if (cmd.action === "play") {
        active.play().then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
        }).catch(() => {});
      } else if (cmd.action === "replay") {
        active.currentTime = 0;
        active.play().then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
        }).catch(() => {});
      } else if (cmd.action === "seek") {
        if (typeof cmd.time === "number") {
          active.currentTime = cmd.time;
        }
      } else if (cmd.action === "smooth-skip") {
        // Smooth fade out over 1.2s then skip
        const currentVol = active.volume;
        const fadeInterval = setInterval(() => {
          if (active.volume > 0.05) {
            active.volume = Math.max(0, active.volume - 0.1);
          } else {
            clearInterval(fadeInterval);
            active.volume = currentVol;
            socket.emit("song:skip");
          }
        }, 100);
      } else if (cmd.action === "volume") {
        active.volume = cmd.volume;
      }
    };

    socket.on("state:update", onStateUpdate);
    socket.on("player:control", onPlayerControl);

    const onToastNewSong = (songData) => {
      setSongToast(songData);
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
      toastTimeout.current = setTimeout(() => {
        setSongToast(null);
      }, 5000);
    };

    const onRoomDeleted = () => {
      alert("ห้องนี้ถูกปิดหรือหมดอายุแล้ว กำลังกลับสู่หน้ารวมห้อง...");
      window.location.href = "/";
    };

    socket.on("toast:new-song", onToastNewSong);
    socket.on("room:deleted", onRoomDeleted);

    return () => {
      socket.off("state:update", onStateUpdate);
      socket.off("player:control", onPlayerControl);
      socket.off("toast:new-song", onToastNewSong);
      socket.off("room:deleted", onRoomDeleted);
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, []);

  // Crossfade transition: fade out current deck, fade in target deck
  const crossfadeTo = (newUrl) => {
    const targetDeck = activeDeck.current === "A" ? "B" : "A";
    const currentAudio = activeDeck.current === "A" ? audioA.current : audioB.current;
    const targetAudio = targetDeck === "A" ? audioA.current : audioB.current;

    if (!targetAudio) return;

    if (crossfadeInterval.current) clearInterval(crossfadeInterval.current);

    const targetMasterVol = state.master_volume ?? 1;
    activeDeck.current = targetDeck; // Switch active deck immediately so timeUpdate and controls bind to it
    targetAudio.src = newUrl;

    const hadCurrentPlaying = currentAudio && !currentAudio.paused && currentAudio.src;

    if (!hadCurrentPlaying) {
      // First song or starting from silence: play immediately at master volume
      targetAudio.volume = targetMasterVol;
      const playPromise = targetAudio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setAudioLoading(false);
            setAutoplayBlocked(false);
          })
          .catch((err) => {
            console.warn("[Autoplay Policy] Blocked:", err);
            setAutoplayBlocked(true);
            setAudioLoading(false);
          });
      }
      return;
    }

    // Has song playing: crossfade smoothly
    targetAudio.volume = 0; // Start silent
    const playPromise = targetAudio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setAudioLoading(false);
          setAutoplayBlocked(false);

          let step = 0;
          const totalSteps = 25; // 2.5s
          crossfadeInterval.current = setInterval(() => {
            step++;
            const progress = step / totalSteps;
            targetAudio.volume = Math.min(targetMasterVol, targetMasterVol * progress);
            if (currentAudio) {
              currentAudio.volume = Math.max(0, targetMasterVol * (1 - progress));
            }

            if (step >= totalSteps) {
              clearInterval(crossfadeInterval.current);
              crossfadeInterval.current = null;
              if (currentAudio) {
                currentAudio.pause();
                currentAudio.src = "";
              }
            }
          }, 100);
        })
        .catch((err) => {
          console.warn("[Autoplay Policy] Blocked:", err);
          setAutoplayBlocked(true);
          setAudioLoading(false);
        });
    }
  };

  // Autoplay & Song Stream Trigger
  useEffect(() => {
    const song = state.current_song;
    if (!song) {
      if (audioA.current) { audioA.current.pause(); audioA.current.src = ""; }
      if (audioB.current) { audioB.current.pause(); audioB.current.src = ""; }
      setIsPlaying(false);
      currentLoadedVideoId.current = null;
      return;
    }

    if (currentLoadedVideoId.current === song.video_id) return;
    currentLoadedVideoId.current = song.video_id;

    const startStreaming = async () => {
      setAudioLoading(true);
      try {
        const res = await fetch(`/api/audio-url/${song.video_id}`);
        const data = await res.json();
        if (data.status === "success" && data.audio_url) {
          crossfadeTo(data.audio_url);
        } else {
          setAudioLoading(false);
        }
      } catch {
        setAudioLoading(false);
      }
    };

    startStreaming();
  }, [state.current_song]);

  const togglePlayPause = () => {
    const active = activeDeck.current === "A" ? audioA.current : audioB.current;
    if (!active || !active.src) return;
    if (isPlaying) {
      active.pause();
      setIsPlaying(false);
    } else {
      active.play().then(() => {
        setIsPlaying(true);
        setAutoplayBlocked(false);
      });
    }
  };

  const handleAudioEnded = () => {
    socket.emit("song:skip");
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds === 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const lastReportedTime = useRef(0);

  const handleTimeUpdate = (e) => {
    const active = activeDeck.current === "A" ? audioA.current : audioB.current;
    if (e.target !== active) return;
    const cur = active.currentTime || 0;
    const dur = active.duration || 0;
    setCurrentTime(cur);
    if (Math.abs(cur - lastReportedTime.current) >= 1) {
      lastReportedTime.current = cur;
      socket.emit("player:progress", { currentTime: cur, duration: dur });
    }
  };

  // User click to unlock autoplay audio permanently
  const unlockAudio = () => {
    const active = activeDeck.current === "A" ? audioA.current : audioB.current;
    if (active) {
      active.volume = state.master_volume ?? 1;
      active.play().then(() => {
        setIsPlaying(true);
        setAutoplayBlocked(false);
      }).catch((err) => {
        console.error("Unlock error:", err);
      });
    }
  };

  // Screen Wake Lock API to prevent iPad/Tablet from sleeping
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch (e) {}
    };
    requestWakeLock();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") requestWakeLock();
    });
    return () => {
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const toggleMute = () => {
    const active = getActiveAudio();
    if (!active) return;
    if (isMuted) {
      active.volume = state.master_volume ?? 1;
      setIsMuted(false);
    } else {
      active.volume = 0;
      setIsMuted(true);
    }
  };

  const handleRemoveQueueItem = (itemId) => {
    socket.emit("admin:delete", { item_id: itemId, token: "session_node_admin_1234" });
  };

  const bgMode = state.bg_mode || "album_blur";
  const bgCustomUrl = state.bg_custom_url || "";
  const currentCover = state.current_song?.thumbnail || DEFAULT_COVER;
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="relative w-screen h-screen select-none overflow-hidden bg-void text-white flex flex-col items-center justify-center p-2.5 sm:p-4 md:p-6 antialiased selection:bg-neonPink">
      
      {/* Dynamic Background Glow Orbs (Matching UserPage) */}
      <div className="fixed -top-32 -left-32 w-96 h-96 rounded-full bg-neonViolet/25 blur-[120px] pointer-events-none animate-float-orb-1"></div>
      <div className="fixed -bottom-32 -right-32 w-96 h-96 rounded-full bg-cyberCyan/20 blur-[130px] pointer-events-none animate-float-orb-2"></div>
      <div className="fixed top-1/3 -right-20 w-80 h-80 rounded-full bg-neonPink/15 blur-[120px] pointer-events-none"></div>

      {/* BACKGROUND LAYER: Custom Image or Album Art Blur */}
      {bgMode === "album_blur" && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none transition-all duration-1000">
          <img
            src={currentCover}
            alt=""
            className="w-full h-full object-cover filter blur-[80px] scale-125 opacity-40 brightness-80"
          />
          <div className="absolute inset-0 bg-void/60 backdrop-blur-sm"></div>
        </div>
      )}

      {bgMode === "custom_image" && bgCustomUrl && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none transition-all duration-1000">
          <img
            src={bgCustomUrl}
            alt="Custom Background"
            className="w-full h-full object-cover opacity-85 filter brightness-85 contrast-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-void/90 via-void/40 to-void/70"></div>
        </div>
      )}

      {/* Hidden Dual-Deck Audio Elements */}
      <audio
        ref={audioA}
        autoPlay
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => handleTimeUpdate(e, "A")}
        onLoadedMetadata={(e) => {
          if (activeDeck.current === "A") {
            const dur = e.target.duration || 0;
            setDuration(dur);
            socket.emit("player:progress", { currentTime: 0, duration: dur });
          }
        }}
        onEnded={() => handleAudioEnded("A")}
      />
      <audio
        ref={audioB}
        autoPlay
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => handleTimeUpdate(e, "B")}
        onLoadedMetadata={(e) => {
          if (activeDeck.current === "B") {
            const dur = e.target.duration || 0;
            setDuration(dur);
            socket.emit("player:progress", { currentTime: 0, duration: dur });
          }
        }}
        onEnded={() => handleAudioEnded("B")}
      />

      {/* Autoplay Unlock Banner */}
      {autoplayBlocked && (
        <div
          onClick={unlockAudio}
          className="absolute inset-x-4 top-4 z-50 py-3 px-6 bg-gradient-to-r from-neonViolet via-neonPink to-cyberCyan text-white text-center font-bold text-sm shadow-2xl rounded-2xl cursor-pointer animate-pulse flex items-center justify-center space-x-2"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>แตะหน้าจอ 1 ครั้ง เพื่อเปิดเสียง (Tap once to enable sound)</span>
        </div>
      )}

      {/* Toast Notification */}
      {songToast && (
        <div className="absolute top-6 right-6 z-50 max-w-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="frosted-glass border border-cyberCyan/40 rounded-2xl p-3 shadow-2xl neon-glow-cyan flex items-center space-x-3">
            <img 
              src={songToast.thumbnail || DEFAULT_COVER} 
              onError={(e) => {
                if (e.target.src.includes("maxresdefault.jpg")) {
                  e.target.src = e.target.src.replace("maxresdefault.jpg", "hqdefault.jpg");
                }
              }}
              alt="" 
              className="w-12 h-12 rounded-xl object-cover border border-white/10" 
            />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black text-cyberCyan uppercase tracking-wider flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-neonPink animate-ping"></span>
                <span>{songToast.autoPlayed ? "เริ่มเล่นทันที" : "เพลงใหม่เข้าคิว"}</span>
              </div>
              <div className="text-xs font-extrabold truncate text-white mt-0.5">{songToast.title}</div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CARD FRAME: Frosted Glass & Neon Cyberpunk (Matching UserPage) */}
      <div className="relative z-10 w-full h-full max-w-[1650px] flex flex-col overflow-hidden frosted-glass border border-white/10 rounded-[28px] sm:rounded-[36px] shadow-2xl neon-glow-violet">
        
        {/* HEADER BAR */}
        <header className="px-5 sm:px-8 py-3.5 border-b border-white/10 flex items-center justify-between flex-shrink-0 bg-void/50 backdrop-blur-xl">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-neonViolet via-neonPink to-cyberCyan p-[1.5px] shadow-lg shadow-purple-500/25">
              <div className="w-full h-full bg-void rounded-2xl flex items-center justify-center">
                <Disc3 className="w-5 h-5 text-cyberCyan animate-spin" style={{ animationDuration: isPlaying ? "4s" : "12s" }} />
              </div>
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold tracking-wide text-white flex items-center space-x-2">
                <span>{state.room_name || "Restaurant Jukebox"}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyberCyan/15 text-cyberCyan border border-cyberCyan/30 font-bold">LIVE STAGE</span>
              </h1>
              <p className="text-[11px] text-cyberCyan font-mono flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyberCyan animate-ping"></span>
                <span>IP: {serverInfo?.local_ip || "192.168.0.x"}:8888</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 sm:space-x-3">
            {/* Live Clock Pill */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full frosted-glass border border-white/10 text-xs font-bold text-mutedGray">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-mono text-white">{clock || "Live"}</span>
            </div>

            <a
              href="/"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl frosted-glass border border-white/10 hover:border-white/30 text-zinc-300 hover:text-white text-xs font-semibold transition"
            >
              <span>หน้ารวมห้อง</span>
            </a>

            <button
              onClick={() => setShowQrModal(true)}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-neonViolet/30 to-cyberCyan/30 hover:from-neonViolet/50 hover:to-cyberCyan/50 border border-cyberCyan/50 text-white text-xs font-bold transition shadow-lg shadow-cyan-500/15 active:scale-95"
            >
              <QrCode className="w-3.5 h-3.5 text-cyberCyan" />
              <span>QR ขอเพลง</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="w-9 h-9 rounded-xl frosted-glass border border-white/10 flex items-center justify-center text-mutedGray hover:text-white transition hover:border-white/25"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* MAIN BODY: 2 Full-Height Balanced Columns */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden p-3.5 sm:p-5 lg:p-6 gap-4 lg:gap-6">
          
          {/* LEFT COLUMN: HERO VINYL ARTWORK & ANIMATED CONTROLS */}
          <div className="w-full md:w-[48%] lg:w-[50%] flex flex-col justify-between space-y-3.5 h-full">
            
            {/* Expanded Hero Artwork Card with Vinyl Aesthetic */}
            <div className="relative flex-1 rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-cosmic group flex items-center justify-center min-h-[260px]">
              
              {/* Background Cover Blur */}
              <img
                src={state.current_song ? state.current_song.thumbnail : DEFAULT_COVER}
                onError={(e) => {
                  if (e.target.src && e.target.src.includes("maxresdefault.jpg")) {
                    e.target.src = e.target.src.replace("maxresdefault.jpg", "hqdefault.jpg");
                  }
                }}
                alt="Artwork"
                className="absolute inset-0 w-full h-full object-cover filter brightness-[0.75] transition duration-700 group-hover:scale-105"
              />
              
              {/* Cyber Ambient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent"></div>

              {/* Animated Floating Vinyl Record in the Center (When Playing) */}
              <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
                <div className={`w-36 h-36 sm:w-44 sm:h-44 lg:w-52 lg:h-52 rounded-full p-2 border-2 border-white/20 shadow-2xl bg-black/70 backdrop-blur-md flex items-center justify-center relative ${isPlaying ? "vinyl-spin" : ""}`}>
                  <div className="absolute inset-2 rounded-full border border-dashed border-white/20"></div>
                  <div className="absolute inset-8 rounded-full border border-white/15"></div>
                  <img
                    src={state.current_song ? state.current_song.thumbnail : DEFAULT_COVER}
                    alt=""
                    className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-full object-cover border-4 border-black/80 shadow-lg"
                  />
                  <div className="absolute w-4 h-4 bg-void border-2 border-cyberCyan rounded-full"></div>
                </div>
              </div>

              {/* Bottom Song Details Pill */}
              <div className="absolute bottom-4 sm:bottom-6 inset-x-5 text-center z-10">
                <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-void/80 border border-cyberCyan/40 text-cyberCyan text-[11px] font-black uppercase tracking-wider mb-2 shadow-lg shadow-cyan-500/10">
                  <span className={`w-2 h-2 rounded-full ${isPlaying ? "bg-neonPink animate-ping" : "bg-mutedGray"}`}></span>
                  <span>{audioLoading ? "กำลังโหลดเสียง..." : isPlaying ? "NOW PLAYING" : "PAUSED"}</span>
                </div>
                <h3 className="text-lg sm:text-2xl lg:text-3xl font-black text-white tracking-wide truncate drop-shadow-xl">
                  {state.current_song ? state.current_song.title : "พร้อมรับคิวเพลง"}
                </h3>
                <p className="text-xs sm:text-sm font-bold text-mutedGray truncate mt-1">
                  {state.current_song ? state.current_song.artist : "สแกน QR Code ด้านขวาเพื่อขอเพลง"}
                </p>
              </div>

              {/* Hover Play/Pause Overlay */}
              <button
                onClick={togglePlayPause}
                className="absolute z-20 w-16 h-16 rounded-full bg-void/70 backdrop-blur-md border border-cyberCyan/50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition shadow-2xl active:scale-95 hover:bg-cyberCyan/20"
              >
                {isPlaying ? <Pause className="w-7 h-7 fill-current text-cyberCyan" /> : <Play className="w-7 h-7 fill-current text-cyberCyan ml-0.5" />}
              </button>
            </div>

            {/* Now Playing Wave & Controls Panel (Frosted Glass & Cyber Cyan) */}
            <div className="frosted-glass border border-white/10 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 flex flex-col space-y-3 shadow-xl">
              
              <div className="flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-cyberCyan flex items-center space-x-1.5">
                    <Sparkles className="w-3 h-3 text-cyberCyan animate-pulse" />
                    <span>Now Playing Vibe</span>
                  </span>
                  <h4 className="text-xs sm:text-sm font-extrabold text-white truncate mt-0.5">
                    {state.current_song ? state.current_song.title : "ไม่มีเพลงที่กำลังเล่น"}
                  </h4>
                  <p className="text-[11px] text-mutedGray truncate">
                    {state.current_song ? state.current_song.artist : "คิวเพลงว่าง"}
                  </p>
                </div>

                {/* Animated Bouncing Equalizer Wave Bars */}
                <div className="flex items-end space-x-1 h-7 px-2 flex-shrink-0">
                  {[0.4, 0.7, 1.0, 0.5, 0.85, 0.35, 0.95, 0.6].map((rate, i) => (
                    <div
                      key={i}
                      className="w-1 bg-gradient-to-t from-neonViolet via-neonPink to-cyberCyan rounded-full"
                      style={{
                        height: isPlaying ? "100%" : "20%",
                        animation: isPlaying ? `bounce ${0.7 + i * 0.12}s ease-in-out infinite alternate` : "none",
                        opacity: isPlaying ? 0.95 : 0.25,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Progress Bar & Timestamps */}
              <div className="space-y-1">
                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-neonViolet via-neonPink to-cyberCyan rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] font-mono text-mutedGray">
                  <span className="text-cyberCyan">{formatTime(currentTime)}</span>
                  <span>{formatTime(duration || state.current_song?.duration || 0)}</span>
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center justify-center space-x-6 pt-0.5">
                <button
                  onClick={() => socket.emit("admin:replay", { token: "session_node_admin_1234" })}
                  className="text-mutedGray hover:text-white transition p-1.5 hover:bg-white/5 rounded-xl"
                  title="เล่นซ้ำ"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  onClick={togglePlayPause}
                  className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-neonViolet to-cyberCyan hover:opacity-90 text-slate-950 flex items-center justify-center transition shadow-lg shadow-cyan-500/20 active:scale-95"
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>

                <button
                  onClick={() => socket.emit("song:skip")}
                  className="text-mutedGray hover:text-white transition p-1.5 hover:bg-white/5 rounded-xl"
                  title="ข้ามเพลง"
                >
                  <SkipForward className="w-5 h-5" />
                </button>

                <button
                  onClick={toggleMute}
                  className="text-mutedGray hover:text-white transition p-1.5 hover:bg-white/5 rounded-xl"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-neonPink" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>

            </div>

          </div>

          {/* RIGHT COLUMN: MUSIC QUEUE (Matching UserPage Theme) */}
          <div className="flex-1 flex flex-col frosted-glass border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl overflow-hidden">
            
            {/* Header: Music Queue */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyberCyan/15 flex items-center justify-center text-cyberCyan">
                  <ListMusic className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-white">Music Queue</h2>
                  <p className="text-[10px] text-mutedGray">คิวเพลงทั้งหมด ({state.queue.length})</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowQrModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-neonViolet/20 to-cyberCyan/20 hover:from-neonViolet/30 hover:to-cyberCyan/30 border border-cyberCyan/40 text-[11px] font-extrabold text-white transition active:scale-95"
                >
                  + ขอเพลง
                </button>
                <a
                  href="/admin"
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-mutedGray hover:text-white transition"
                  title="Admin Settings"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Queue List Scrollable */}
            <div className="flex-1 overflow-y-auto pt-3 space-y-2.5 pr-1 custom-scrollbar">
              {state.queue.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-mutedGray">
                  <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                    <Music2 className="w-8 h-8 opacity-40 text-cyberCyan" />
                  </div>
                  <p className="text-xs font-bold text-white">ยังไม่มีเพลงในคิว</p>
                  <p className="text-[11px] text-mutedGray mt-1">สแกน QR Code ด้านล่างเพื่อขอเพลงได้เลย</p>
                  <button
                    onClick={() => setShowQrModal(true)}
                    className="mt-4 px-4 py-2 rounded-xl bg-gradient-to-r from-neonViolet to-cyberCyan text-slate-950 text-xs font-black hover:opacity-90 transition active:scale-95 shadow-lg shadow-cyan-500/20"
                  >
                    แสดง QR Code ใหญ่
                  </button>
                </div>
              ) : (
                state.queue.map((item, idx) => {
                  const isUpNext = idx === 0;
                  return (
                    <div
                      key={item.id}
                      className={`group flex items-center justify-between p-2.5 rounded-2xl border transition ${
                        isUpNext
                          ? "bg-gradient-to-r from-neonViolet/20 via-cyberCyan/15 to-transparent border-cyberCyan/50 shadow-lg shadow-cyan-500/10"
                          : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/15"
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="flex flex-col items-center justify-center w-5 text-mutedGray text-xs font-mono font-black">
                          {idx + 1}
                        </div>

                        <img
                          src={item.thumbnail || DEFAULT_COVER}
                          onError={(e) => {
                            if (e.target.src && e.target.src.includes("maxresdefault.jpg")) {
                              e.target.src = e.target.src.replace("maxresdefault.jpg", "hqdefault.jpg");
                            }
                          }}
                          alt=""
                          className="w-11 h-11 rounded-xl object-cover flex-shrink-0 bg-cosmic border border-white/10"
                        />

                        <div className="flex-1 min-w-0 pr-2">
                          <h4 className="text-xs font-extrabold text-white truncate">{item.title}</h4>
                          <p className="text-[10px] text-mutedGray truncate mt-0.5">{item.artist}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2.5 flex-shrink-0">
                        {isUpNext && (
                          <span className="px-2 py-0.5 rounded-md bg-neonPink/20 text-neonPink text-[9px] font-black uppercase tracking-tight border border-neonPink/30 animate-pulse">
                            Up Next
                          </span>
                        )}

                        <span className="text-[11px] font-mono text-mutedGray">
                          {item.duration_str || "3:30"}
                        </span>

                        <button
                          onClick={() => handleRemoveQueueItem(item.id)}
                          className="opacity-0 group-hover:opacity-100 text-mutedGray hover:text-neonPink text-xs flex items-center space-x-0.5 transition px-1"
                          title="ลบเพลง"
                        >
                          <span className="text-[10px]">Remove</span>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Quick QR Code Card (Matching UserPage Card Style) */}
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between px-2.5 bg-white/[0.02] rounded-2xl p-2.5">
              <div className="flex items-center space-x-3">
                <div
                  onClick={() => setShowQrModal(true)}
                  className="w-12 h-12 bg-white p-1 rounded-xl shadow-lg cursor-pointer hover:scale-105 transition flex-shrink-0 border-2 border-cyberCyan/40"
                >
                  {qrDataUrl && <img src={qrDataUrl} alt="QR" className="w-full h-full object-contain" />}
                </div>
                <div>
                  <p className="text-xs font-extrabold text-white flex items-center space-x-1.5">
                    <span>สแกนแจมเพลง</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-cyberCyan animate-ping"></span>
                  </p>
                  <p className="text-[10px] text-mutedGray truncate max-w-[170px] font-mono">
                    {serverInfo?.client_url || window.location.origin}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowQrModal(true)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-bold text-cyberCyan border border-white/10 transition active:scale-95"
              >
                ขยายใหญ่
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* POPUP MODAL: High-Res QR Code (Matching UserPage Glass Aesthetic) */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="frosted-glass border border-cyberCyan/40 rounded-3xl p-6 max-w-xs w-full shadow-2xl neon-glow-cyan flex flex-col items-center text-center relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/10 text-mutedGray hover:text-white flex items-center justify-center"
            >
              ✕
            </button>

            <h3 className="text-base font-black text-white mb-1">สแกนเพื่อขอเพลง</h3>
            <p className="text-xs text-mutedGray mb-4">เชื่อมต่อ Wi-Fi เดียวกันแล้วเปิดกล้องสแกน</p>

            <div className="bg-white p-3.5 rounded-2xl shadow-2xl mb-3 border-4 border-cyberCyan/30">
              {qrDataUrl && <img src={qrDataUrl} alt="QR Code" className="w-48 h-48" />}
            </div>

            <p className="text-xs font-mono text-cyberCyan bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 truncate max-w-full font-bold">
              {serverInfo?.client_url || window.location.origin}
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
