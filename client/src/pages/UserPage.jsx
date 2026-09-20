import React, { useState, useEffect, useRef } from "react";
import socket from "../socket";
import { 
  Search, Disc3, Radio, Sparkles, Plus, Check, ListMusic, ArrowUpRight,
  Compass, X, Loader2, Music
} from "lucide-react";
import Swal from "sweetalert2";

const DEFAULT_COVER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23121216'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%238E8E93' dy='.3em' font-size='12'%3ENo Music%3C/text%3E%3C/svg%3E";

export default function UserPage({ roomId = "main" }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState("search"); // 'search' | 'queue'
  const [justAddedId, setJustAddedId] = useState(null);
  const searchContainerRef = useRef(null);

  // Authentication & Access control states
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false);
  const [inputPasscode, setInputPasscode] = useState("");
  const [authError, setAuthError] = useState("");

  // Recommendations Modal & Infinite Scroll States
  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [recommendSongs, setRecommendSongs] = useState([]);
  const [recommendPage, setRecommendPage] = useState(1);
  const [hasMoreRecommend, setHasMoreRecommend] = useState(true);
  const [loadingRecommend, setLoadingRecommend] = useState(false);
  const [loadingMoreRecommend, setLoadingMoreRecommend] = useState(false);
  const recommendScrollRef = useRef(null);

  // Check QR Bypass token (?t=...) or stored session passcode
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const qrToken = urlParams.get("t");
    const storedPasscode = sessionStorage.getItem(`room_passcode_${roomId}`) || "";

    const verifyAccess = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: qrToken || "", passcode: storedPasscode }),
        });
        const data = await res.json();
        if (res.ok && data.status === "success") {
          setIsAuthorized(true);
          setPasscodeModalOpen(false);
          // Connect to room in socket
          socket.emit("room:join", { roomId, token: qrToken || "", passcode: storedPasscode }, (socketRes) => {
            if (socketRes?.state) setState(socketRes.state);
          });
        } else {
          // If requires passcode, open prompt
          setIsAuthorized(false);
          setPasscodeModalOpen(true);
        }
      } catch (err) {
        setIsAuthorized(false);
        setPasscodeModalOpen(true);
      } finally {
        setAuthChecking(false);
      }
    };

    verifyAccess();
  }, [roomId]);

  const handlePasscodeSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch(`/api/rooms/${roomId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: inputPasscode.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        sessionStorage.setItem(`room_passcode_${roomId}`, inputPasscode.trim());
        setIsAuthorized(true);
        setPasscodeModalOpen(false);
        socket.emit("room:join", { roomId, passcode: inputPasscode.trim() }, (socketRes) => {
          if (socketRes?.state) setState(socketRes.state);
        });
      } else {
        setAuthError(data.message || "รหัสผ่านเข้าห้องไม่ถูกต้อง");
      }
    } catch {
      setAuthError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
  };

  const fetchRecommendations = async (page = 1, isAppend = false) => {
    if (page === 1) setLoadingRecommend(true);
    else setLoadingMoreRecommend(true);

    try {
      const res = await fetch(`/api/rooms/${roomId}/recommendations?page=${page}`);
      const data = await res.json();
      if (data.status === "success") {
        const newItems = data.recommendations || [];
        if (isAppend) {
          setRecommendSongs((prev) => [...prev, ...newItems]);
        } else {
          setRecommendSongs(newItems);
        }
        setHasMoreRecommend(data.has_more ?? (newItems.length > 0));
        setRecommendPage(page);
      }
    } catch (err) {
      console.error("Fetch recommendations error:", err);
    } finally {
      setLoadingRecommend(false);
      setLoadingMoreRecommend(false);
    }
  };

  const openRecommendModal = () => {
    setShowRecommendModal(true);
    setRecommendPage(1);
    fetchRecommendations(1, false);
  };

  const handleRecommendScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 80 && hasMoreRecommend && !loadingMoreRecommend && !loadingRecommend) {
      fetchRecommendations(recommendPage + 1, true);
    }
  };

  const [state, setState] = useState({
    room_name: "Restaurant Jukebox",
    is_accepting_requests: true,
    current_song: null,
    queue: [],
  });

  useEffect(() => {
    const onStateUpdate = (newState) => {
      setState(newState);
    };

    const onRoomDeleted = (data) => {
      Swal.fire({
        icon: "info",
        title: "ห้องนี้ถูกปิดการใช้งานแล้ว",
        text: data?.message || "กำลังนำคุณกลับสู่หน้ารวมห้อง...",
        timer: 2000,
        showConfirmButton: false,
        background: "#18181b",
        color: "#fff",
      }).then(() => {
        window.location.href = "/";
      });
    };

    socket.on("state:update", onStateUpdate);
    socket.on("room:deleted", onRoomDeleted);
    return () => {
      socket.off("state:update", onStateUpdate);
      socket.off("room:deleted", onRoomDeleted);
    };
  }, []);

  // Close dropdown on click or touch outside (Mobile friendly)
  useEffect(() => {
    const handlePointerDownOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDownOutside);
    document.addEventListener("touchstart", handlePointerDownOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside);
      document.removeEventListener("touchstart", handlePointerDownOutside);
    };
  }, []);

  // Suggestions Fetcher (Only when typing, not when selecting a suggestion)
  const isSelectingSuggestion = useRef(false);

  useEffect(() => {
    if (isSelectingSuggestion.current) {
      isSelectingSuggestion.current = false;
      return;
    }

    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setSuggestions(list);
        if (list.length > 0) {
          setShowDropdown(true);
        }
      } catch (err) {
        setSuggestions([]);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Execute Search Function
  const executeSearch = async (queryText) => {
    const q = queryText.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setShowDropdown(false); // Immediately dismiss suggestion dropdown

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Search Debounce (Auto search when user pauses typing)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(() => {
      executeSearch(searchQuery);
    }, 450);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectSuggestion = (item) => {
    isSelectingSuggestion.current = true;
    setShowDropdown(false);
    setSuggestions([]);
    setSearchQuery(item);
    executeSearch(item);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setShowDropdown(false);
    setSuggestions([]);
    if (document.activeElement) {
      document.activeElement.blur(); // Dismiss mobile virtual keyboard
    }
    executeSearch(searchQuery);
  };

  // One-Click Request with SweetAlert2 confirmation
  const handleRequestSong = (song) => {
    socket.emit(
      "song:request",
      {
        roomId,
        song_info: song,
        user_name: "",
        table_no: "",
        user_id: "",
      },
      (res) => {
        if (res.status === "success") {
          setJustAddedId(song.video_id);
          setTimeout(() => setJustAddedId(null), 1800);

          const isAutoPlayed = res.result?.autoPlayed;

          Swal.fire({
            title: isAutoPlayed ? "เริ่มเล่นทันที" : "เพลงถูกเพิ่มเข้าไปในคิวแล้ว",
            html: `
              <div style="display:flex;align-items:center;gap:12px;text-align:left;background:rgba(255,255,255,0.06);padding:10px;border-radius:14px;border:1px solid rgba(0,240,255,0.3);margin-top:10px;">
                <img src="${song.thumbnail}" style="width:52px;height:52px;border-radius:10px;object-fit:cover;" />
                <div style="overflow:hidden;">
                  <div style="font-size:14px;font-weight:bold;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${song.title}</div>
                  <div style="font-size:12px;color:#8E8E93;margin-top:2px;">${song.artist || "ศิลปิน"}</div>
                </div>
              </div>
            `,
            background: "#0a0a0f",
            color: "#ffffff",
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true,
            customClass: {
              popup: "border border-cyan-500/40 rounded-3xl backdrop-blur-xl shadow-2xl",
            },
          });
        } else {
          Swal.fire({
            icon: "warning",
            title: "ไม่สามารถขอเพลงได้",
            text: res.message || "",
            background: "#0a0a0f",
            color: "#ffffff",
            confirmButtonColor: "#FF007A",
            confirmButtonText: "ตกลง",
          });
        }
      }
    );
  };

  return (
    <div className="text-white min-h-screen pb-28 antialiased bg-void selection:bg-neonPink relative overflow-x-hidden">
      {/* Dynamic Background Glows */}
      <div className="fixed -top-32 -left-32 w-72 h-72 rounded-full bg-neonViolet/20 blur-[100px] pointer-events-none"></div>
      <div className="fixed top-1/2 -right-32 w-72 h-72 rounded-full bg-cyberCyan/15 blur-[100px] pointer-events-none"></div>

      {/* Modern App Bar */}
      <header className="sticky top-0 z-40 bg-void/80 backdrop-blur-2xl border-b border-white/10 px-5 py-3.5 flex items-center justify-between shadow-xl">
        <div className="flex items-center space-x-3">
          <a
            href="/"
            title="กลับไปหน้ารวมห้อง"
            className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-neonViolet via-neonPink to-cyberCyan p-[1.5px] shadow-lg shadow-purple-500/25 block hover:opacity-90 transition-opacity"
          >
            <div className="w-full h-full bg-void rounded-2xl flex items-center justify-center">
              <Disc3 className="w-5 h-5 text-cyberCyan animate-spin" style={{ animationDuration: "6s" }} />
            </div>
          </a>
          <div>
            <h1 className="font-extrabold text-sm text-white tracking-wide truncate max-w-[170px]">
              {state.room_name}
            </h1>
            <p className="text-[11px] text-cyberCyan flex items-center space-x-1.5 font-semibold">
              <span className="w-2 h-2 rounded-full bg-cyberCyan animate-ping"></span>
              <span>ขอเพลงเข้าปาร์ตี้</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full frosted-glass border border-white/10 text-xs font-bold text-mutedGray">
            <Radio className="w-3.5 h-3.5 text-cyberCyan animate-pulse" />
            <span>{state.is_accepting_requests ? "เปิดรับเพลง" : "ปิดรับเพลง"}</span>
          </div>
          <a
            href="/"
            className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-zinc-300 transition"
          >
            ออก
          </a>
        </div>
      </header>

      {/* Floating Now Playing Pill */}
      <div className="p-4 max-w-md mx-auto">
        <div className="frosted-glass rounded-3xl p-3.5 border border-white/10 shadow-2xl neon-glow-violet flex items-center space-x-3.5">
          <img
            src={state.current_song ? state.current_song.thumbnail : DEFAULT_COVER}
            alt=""
            className="w-14 h-14 rounded-2xl object-cover shadow-lg border border-white/10 bg-cosmic flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-1.5 text-[10px] font-black text-cyberCyan uppercase tracking-wider mb-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neonPink animate-ping"></span>
              <span>NOW PLAYING</span>
            </div>
            <h3 className="font-extrabold text-sm text-white truncate leading-tight">
              {state.current_song ? state.current_song.title : "ยังไม่มีเพลงที่กำลังเล่น"}
            </h3>
            <p className="text-xs text-mutedGray truncate mt-0.5">
              {state.current_song ? state.current_song.artist : "ขอเพลงด้านล่างเพื่อเริ่มเล่น"}
            </p>
          </div>
        </div>
      </div>

      {/* Switch Tabs & Recommendation Button */}
      <div className="max-w-md mx-auto px-4 space-y-2.5">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab("search")}
            className={`flex-1 py-2.5 rounded-2xl text-xs font-extrabold transition flex items-center justify-center space-x-2 border ${
              activeTab === "search"
                ? "bg-gradient-to-r from-neonViolet/30 to-cyberCyan/30 border-cyberCyan/50 text-white shadow-lg shadow-cyan-500/15"
                : "frosted-glass border-white/10 text-mutedGray hover:text-white"
            }`}
          >
            <Search className="w-4 h-4" />
            <span>ค้นหาเพลง</span>
          </button>

          <button
            onClick={() => setActiveTab("queue")}
            className={`flex-1 py-2.5 rounded-2xl text-xs font-extrabold transition flex items-center justify-center space-x-2 border ${
              activeTab === "queue"
                ? "bg-gradient-to-r from-neonViolet/30 to-cyberCyan/30 border-cyberCyan/50 text-white shadow-lg shadow-cyan-500/15"
                : "frosted-glass border-white/10 text-mutedGray hover:text-white"
            }`}
          >
            <ListMusic className="w-4 h-4" />
            <span>คิวเพลงในห้อง ({state.queue.length})</span>
          </button>
        </div>

        {/* YouTube-style Recommendation Trigger Button */}
        <button
          onClick={openRecommendModal}
          className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-neonViolet/25 via-neonPink/20 to-cyberCyan/25 hover:from-neonViolet/35 hover:to-cyberCyan/35 border border-cyberCyan/40 text-white font-extrabold text-xs flex items-center justify-between transition shadow-lg shadow-cyan-500/10 active:scale-95 group"
        >
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-lg bg-cyberCyan/20 flex items-center justify-center text-cyberCyan group-hover:rotate-12 transition">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span>เพลงแนะนำถัดไป (สำหรับคุณ)</span>
          </div>
          <div className="flex items-center space-x-1 text-[11px] text-cyberCyan font-bold">
            <span>สำรวจเพลงฮิต</span>
            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
          </div>
        </button>
      </div>

      {/* Main Content Area */}
      <main className="max-w-md mx-auto p-4 space-y-4">
        {activeTab === "search" ? (
          <>
            {/* Search Input with YouTube-style Dropdown */}
            <div ref={searchContainerRef} className="relative z-30">
              <form onSubmit={handleSearchSubmit} action="" className="relative">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowDropdown(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearchSubmit(e);
                    }
                  }}
                  type="search"
                  enterKeyHint="search"
                  placeholder="พิมพ์ชื่อเพลง หรือ ศิลปิน..."
                  className="w-full bg-cosmic border border-white/10 rounded-2xl px-4 py-3.5 pl-11 pr-10 text-sm focus:outline-none focus:border-cyberCyan focus:ring-1 focus:ring-cyberCyan transition text-white placeholder-mutedGray shadow-inner"
                />
                <Search className="w-4 h-4 text-mutedGray absolute left-4 top-4 pointer-events-none" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSuggestions([]);
                      setShowDropdown(false);
                      setSearchResults([]);
                    }}
                    className="absolute right-3.5 top-3.5 text-mutedGray hover:text-white bg-white/10 rounded-full w-5 h-5 flex items-center justify-center text-xs transition active:scale-90"
                  >
                    ✕
                  </button>
                )}
              </form>

              {/* YouTube-Style Autocomplete Floating Dropdown */}
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-[#12121A]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl overflow-hidden z-50 divide-y divide-white/5 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-3 py-1.5 bg-white/5 flex items-center justify-between text-[10px] text-mutedGray font-semibold tracking-wider uppercase">
                    <span className="flex items-center space-x-1">
                      <Sparkles className="w-3 h-3 text-cyberCyan" />
                      <span>คำค้นหาแนะนำจาก YouTube</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDropdown(false)}
                      className="text-mutedGray hover:text-white text-[10px] px-1.5 py-0.5 rounded bg-white/5"
                    >
                      ปิด
                    </button>
                  </div>
                  {suggestions.map((item, idx) => (
                    <div
                      key={idx}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectSuggestion(item);
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        handleSelectSuggestion(item);
                      }}
                      className="px-4 py-3.5 flex items-center justify-between hover:bg-gradient-to-r hover:from-neonViolet/20 hover:to-cyberCyan/20 hover:text-white active:bg-cyberCyan/20 text-slate-300 text-sm cursor-pointer transition group"
                    >
                      <div className="flex items-center space-x-3 truncate">
                        <Search className="w-4 h-4 text-mutedGray group-hover:text-cyberCyan transition flex-shrink-0" />
                        <span className="truncate font-medium text-white">{item}</span>
                      </div>
                      <ArrowUpRight className="w-3.5 h-3.5 text-mutedGray group-hover:text-cyberCyan opacity-60 group-hover:opacity-100 transition flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Results */}
            {searchQuery.trim() ? (
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-xs text-mutedGray px-1">
                  <span>ผลการค้นหา</span>
                  {isSearching && <span className="text-cyberCyan font-bold">กำลังค้นหา...</span>}
                </div>

                {searchResults.length === 0 && !isSearching ? (
                  <div className="text-center py-12 frosted-glass rounded-2xl border border-dashed border-white/10 text-xs text-mutedGray">
                    ไม่พบเพลงที่ค้นหา ลองพิมพ์ชื่ออื่นดูครับ
                  </div>
                ) : (
                  searchResults.map((song) => {
                    const isAdded = justAddedId === song.video_id;
                    return (
                      <div
                        key={song.video_id}
                        className="frosted-glass rounded-2xl p-3 flex items-center justify-between space-x-3 border border-white/10 hover:border-cyberCyan/40 transition shadow-md"
                      >
                        <img
                          src={song.thumbnail}
                          alt=""
                          className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-cosmic shadow"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">{song.title}</h4>
                          <p className="text-[11px] text-mutedGray truncate mt-0.5">{song.artist}</p>
                          <span className="text-[10px] text-cyberCyan font-mono">{song.duration_str}</span>
                        </div>
                        <button
                          onClick={() => handleRequestSong(song)}
                          disabled={isAdded}
                          className={`px-3.5 py-2 rounded-xl text-xs font-black transition active:scale-95 flex items-center space-x-1 flex-shrink-0 ${
                            isAdded
                              ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/30"
                              : "bg-gradient-to-r from-neonViolet to-neonPink hover:opacity-90 text-white shadow-lg shadow-purple-500/25"
                          }`}
                        >
                          {isAdded ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                          <span>{isAdded ? "เพิ่มแล้ว!" : "ขอเพลง"}</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="text-center py-16 frosted-glass rounded-3xl border border-white/10 p-6 space-y-3">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-white/5 flex items-center justify-center text-cyberCyan">
                  <Sparkles className="w-7 h-7" />
                </div>
                <h4 className="font-extrabold text-sm text-white">ค้นหาเพลงโปรดของคุณ</h4>
                <p className="text-xs text-mutedGray max-w-xs mx-auto leading-relaxed">
                  พิมพ์ชื่อเพลงหรือศิลปินในช่องค้นหาด้านบน แล้วกดขอเพลงเพื่อส่งเข้าคิวในร้านได้ทันที
                </p>
              </div>
            )}
          </>
        ) : (
          /* Live Queue Tab */
          <div className="space-y-2.5">
            {state.queue.length === 0 ? (
              <div className="text-center py-16 frosted-glass rounded-3xl border border-dashed border-white/10 p-6 space-y-2">
                <Sparkles className="w-8 h-8 mx-auto text-stone-600 mb-2" />
                <h4 className="font-bold text-sm text-white">ยังไม่มีเพลงในคิว</h4>
                <p className="text-xs text-mutedGray">สลับไปที่แท็บค้นหาเพื่อเป็นคนแรกที่ขอเพลงเลย!</p>
              </div>
            ) : (
              state.queue.map((item, index) => {
                const isFirst = index === 0;
                return (
                  <div
                    key={item.id}
                    className={`frosted-glass rounded-2xl p-3 flex items-center space-x-3 border transition ${
                      isFirst ? "border-cyberCyan/40 bg-gradient-to-r from-neonViolet/15 to-cyberCyan/15" : "border-white/10"
                    }`}
                  >
                    <div
                      className={`w-6 text-center font-black text-xs ${
                        isFirst ? "text-cyberCyan" : "text-neonPink"
                      } flex-shrink-0`}
                    >
                      #{index + 1}
                    </div>
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="w-11 h-11 rounded-xl object-cover flex-shrink-0 shadow bg-cosmic"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-xs font-bold truncate ${isFirst ? "text-white" : "text-slate-200"}`}>
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-mutedGray truncate mt-0.5">{item.artist}</p>
                    </div>
                    <span className="text-[10px] text-mutedGray font-mono flex-shrink-0">{item.duration_str}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* YOUTUBE-STYLE RECOMMENDATION MODAL (INFINITE SCROLL) */}
      {showRecommendModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex flex-col justify-end sm:justify-center items-center sm:p-4 animate-in fade-in duration-200">
          
          {/* Backdrop Click */}
          <div 
            className="absolute inset-0"
            onClick={() => setShowRecommendModal(false)}
          ></div>

          {/* Modal Sheet Container */}
          <div className="relative z-10 w-full sm:max-w-lg bg-void border-t sm:border border-white/15 rounded-t-[32px] sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] h-[650px] overflow-hidden">
            
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between flex-shrink-0 bg-cosmic/70">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyberCyan/15 flex items-center justify-center text-cyberCyan">
                  <Compass className="w-4 h-4 animate-spin" style={{ animationDuration: "10s" }} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center space-x-1.5">
                    <span>เพลงแนะนำถัดไป</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyberCyan/15 text-cyberCyan font-bold">YouTube Radio</span>
                  </h3>
                  <p className="text-[10px] text-mutedGray">เลื่อนลงเพื่อดูเพลงที่เข้ากับมู้ดร้านเพิ่มเติม</p>
                </div>
              </div>

              <button
                onClick={() => setShowRecommendModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-mutedGray hover:text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Song List with Infinite Scroll */}
            <div
              ref={recommendScrollRef}
              onScroll={handleRecommendScroll}
              className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar"
            >
              {loadingRecommend ? (
                <div className="h-64 flex flex-col items-center justify-center space-y-3 text-mutedGray">
                  <Loader2 className="w-7 h-7 text-cyberCyan animate-spin" />
                  <p className="text-xs font-bold text-white">กำลังคำนวณเพลงที่เข้ากับคุณ...</p>
                  <p className="text-[10px]">ดึงข้อมูลจากเพลงฮิตและศิลปินที่กำลังเล่น</p>
                </div>
              ) : recommendSongs.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center space-y-2 text-mutedGray text-center p-6">
                  <Music className="w-8 h-8 text-stone-600 mb-1" />
                  <p className="text-xs font-bold text-white">ยังไม่มีรายการเพลงแนะนำ</p>
                  <p className="text-[10px]">ลองค้นหาเพลงเพื่อสร้าง Seed เพลงที่คุณชอบ</p>
                </div>
              ) : (
                recommendSongs.map((song, idx) => {
                  const isAdded = justAddedId === song.video_id;
                  return (
                    <div
                      key={`${song.video_id}_${idx}`}
                      className="frosted-glass rounded-2xl p-2.5 flex items-center justify-between border border-white/10 hover:border-cyberCyan/40 hover:bg-white/[0.05] transition group"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="relative flex-shrink-0">
                          <img
                            src={song.thumbnail || DEFAULT_COVER}
                            onError={(e) => {
                              if (e.target.src.includes("maxresdefault.jpg")) {
                                e.target.src = e.target.src.replace("maxresdefault.jpg", "hqdefault.jpg");
                              }
                            }}
                            alt=""
                            className="w-14 h-14 rounded-xl object-cover bg-cosmic border border-white/10 group-hover:scale-105 transition"
                          />
                          <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-[9px] font-mono text-white/90">
                            {song.duration_str || "3:30"}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1 pr-2">
                          <h4 className="text-xs font-extrabold text-white truncate group-hover:text-cyberCyan transition">
                            {song.title}
                          </h4>
                          <p className="text-[11px] text-mutedGray truncate mt-0.5">
                            {song.artist || "ศิลปิน"}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRequestSong(song)}
                        disabled={isAdded}
                        className={`ml-2 px-3 py-2 rounded-xl text-xs font-black flex items-center space-x-1 transition active:scale-95 flex-shrink-0 ${
                          isAdded
                            ? "bg-emerald-500 text-white"
                            : "bg-gradient-to-r from-neonViolet to-cyberCyan text-slate-950 hover:opacity-95 shadow-md shadow-cyan-500/20"
                        }`}
                      >
                        {isAdded ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>ขอแล้ว</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>ขอเพลง</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}

              {/* Infinite Scroll Loading Indicator */}
              {loadingMoreRecommend && (
                <div className="py-3 flex items-center justify-center space-x-2 text-cyberCyan text-xs font-bold">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>กำลังโหลดเพลงแนะนำเพิ่มเติม...</span>
                </div>
              )}

              {!hasMoreRecommend && recommendSongs.length > 0 && (
                <div className="py-4 text-center text-[10px] text-mutedGray">
                  <span>✦ คุณได้ดูเพลงแนะนำทั้งหมดแล้ว ✦</span>
                </div>
              )}
            </div>

            {/* Modal Bottom Close Bar */}
            <div className="p-3 border-t border-white/10 bg-cosmic/70 text-center flex items-center justify-between px-4">
              <span className="text-[11px] text-mutedGray">แตะ "ขอเพลง" เพื่อส่งเข้าคิวร้าน</span>
              <button
                onClick={() => setShowRecommendModal(false)}
                className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition"
              >
                ปิดหน้าต่าง
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================= PASSCODE MODAL (When not authorized / no QR bypass) ================= */}
      {passcodeModalOpen && !authChecking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 text-center shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 mb-3">
              <span className="text-xl">🔒</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">
              กรุณาใส่รหัสผ่านเข้าห้อง
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              ห้องนี้ต้องใช้รหัสผ่าน หรือสแกน QR Code จากหน้าจอทีวีเพื่อเข้าใช้งานได้ทันที
            </p>

            {authError && (
              <div className="mb-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 py-1.5 px-3 rounded-xl">
                {authError}
              </div>
            )}

            <form onSubmit={handlePasscodeSubmit} className="space-y-3">
              <input
                type="password"
                autoFocus
                placeholder="กรอกรหัสผ่านห้อง"
                value={inputPasscode}
                onChange={(e) => setInputPasscode(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-center text-lg font-mono text-white tracking-widest focus:outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2">
                <a
                  href="/"
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold transition block text-center"
                >
                  กลับไปเลือกห้อง
                </a>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/30"
                >
                  ยืนยัน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
