import React, { useState, useEffect } from "react";
import { 
  PlusCircle, LogIn, Music, Radio, Sparkles, Shield, KeyRound, 
  ArrowRight, Users, Play, Volume2, Lock, Unlock, CheckCircle2, AlertCircle
} from "lucide-react";
import Swal from "sweetalert2";

export default function LobbyPage() {
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedRoomForJoin, setSelectedRoomForJoin] = useState(null);

  // Create form
  const [roomName, setRoomName] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [roomPasscode, setRoomPasscode] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Join form
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joinPasscode, setJoinPasscode] = useState("");
  const [joinSubmitting, setJoinSubmitting] = useState(false);

  // Super Admin states (jetwit / 704658009zxczZ)
  const [showSuperModal, setShowSuperModal] = useState(false);
  const [superUsername, setSuperUsername] = useState("");
  const [superPassword, setSuperPassword] = useState("");
  const [superToken, setSuperToken] = useState(localStorage.getItem("super_admin_token") || "");
  const [superSubmitting, setSuperSubmitting] = useState(false);

  const fetchRooms = async () => {
    try {
      const res = await fetch("/api/rooms");
      const data = await res.json();
      if (data.status === "success") {
        setRooms(data.rooms || []);
      }
    } catch (err) {
      console.error("Failed to fetch rooms:", err);
    } finally {
      setLoadingRooms(false);
    }
  };

  const handleSuperLogin = async (e) => {
    e.preventDefault();
    setSuperSubmitting(true);
    try {
      const res = await fetch("/api/admin/super-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: superUsername, password: superPassword }),
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        setSuperToken(data.token);
        localStorage.setItem("super_admin_token", data.token);
        setShowSuperModal(false);
        Swal.fire({
          icon: "success",
          title: "เข้าสู่โหมด Super Admin",
          text: "คุณมีสิทธิ์จัดการและลบทุกห้องได้ทันที",
          background: "#18181b",
          color: "#fff",
        });
      } else {
        Swal.fire({
          icon: "error",
          title: "รหัสผ่านไม่ถูกต้อง",
          text: data.message || "กรุณาตรวจสอบชื่อและรหัสผ่าน",
          background: "#18181b",
          color: "#fff",
        });
      }
    } catch {
      Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาดในการเชื่อมต่อ", background: "#18181b", color: "#fff" });
    } finally {
      setSuperSubmitting(false);
    }
  };

  const handleSuperDeleteRoom = async (roomId, roomName, e) => {
    e.stopPropagation();
    if (roomId === "main") {
      Swal.fire({ icon: "warning", title: "ไม่สามารถลบห้องหลัก (Main) ได้", background: "#18181b", color: "#fff" });
      return;
    }

    const confirm = await Swal.fire({
      icon: "warning",
      title: `ลบห้อง "${roomName}" ?`,
      text: "ห้องจะถูกปิดและข้อมูลจะถูกลบออกจากระบบทันที",
      showCancelButton: true,
      confirmButtonText: "ลบห้องทันที",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#3f3f46",
      background: "#18181b",
      color: "#fff",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await fetch(`/api/rooms/${roomId}/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ super_token: superToken }),
        });
        const data = await res.json();
        if (res.ok && data.status === "success") {
          Swal.fire({ icon: "success", title: "ลบห้องสำเร็จ", background: "#18181b", color: "#fff", timer: 1500 });
          fetchRooms();
        } else {
          Swal.fire({ icon: "error", title: "ไม่สามารถลบห้องได้", text: data.message, background: "#18181b", color: "#fff" });
        }
      } catch {
        Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาดในการเชื่อมต่อ", background: "#18181b", color: "#fff" });
      }
    }
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!roomName.trim()) {
      Swal.fire({
        icon: "warning",
        title: "กรุณาระบุชื่อห้อง",
        background: "#18181b",
        color: "#fff",
      });
      return;
    }
    if (!adminPin || adminPin.length < 4) {
      Swal.fire({
        icon: "warning",
        title: "รหัส Admin PIN ต้องมีอย่างน้อย 4 หลัก",
        text: "รหัสนี้จะใช้สำหรับควบคุมเพลงและจัดการห้อง",
        background: "#18181b",
        color: "#fff",
      });
      return;
    }

    setCreateSubmitting(true);
    try {
      const res = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roomName.trim(),
          admin_pin: adminPin.trim(),
          room_passcode: roomPasscode.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        // Save admin token for this room
        if (data.admin_token) {
          localStorage.setItem(`admin_token_${data.room_id}`, data.admin_token);
        }
        
        Swal.fire({
          icon: "success",
          title: "สร้างห้องสำเร็จ!",
          html: `
            <div class="text-left space-y-2 mt-2 text-sm text-zinc-300">
              <p>📍 <b>รหัสห้อง:</b> <span class="text-indigo-400 font-mono">${data.room_id}</span></p>
              <p>🔑 <b>Admin PIN:</b> <span class="text-rose-400 font-mono">${adminPin}</span></p>
              ${roomPasscode ? `<p>🔒 <b>รหัสเข้าห้อง:</b> <span class="text-amber-400 font-mono">${roomPasscode}</span></p>` : `<p class="text-emerald-400">🔓 ห้องนี้ไม่ต้องใช้รหัสผ่านเข้า</p>`}
            </div>
          `,
          confirmButtonText: "ไปยังหน้าจอทีวี (Player)",
          showDenyButton: true,
          denyButtonText: "ไปหน้าจอควบคุม (Admin)",
          background: "#18181b",
          color: "#fff",
          confirmButtonColor: "#6366f1",
          denyButtonColor: "#27272a",
        }).then((result) => {
          if (result.isConfirmed) {
            window.location.href = `/${data.room_id}/player`;
          } else if (result.isDenied) {
            window.location.href = `/${data.room_id}/admin`;
          } else {
            window.location.href = `/${data.room_id}`;
          }
        });
      } else {
        Swal.fire({
          icon: "error",
          title: "ไม่สามารถสร้างห้องได้",
          text: data.message || "เกิดข้อผิดพลาด",
          background: "#18181b",
          color: "#fff",
        });
      }
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาดในการเชื่อมต่อ",
        background: "#18181b",
        color: "#fff",
      });
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    const targetId = (joinRoomId || selectedRoomForJoin?.id || "").trim().toLowerCase();
    if (!targetId) {
      Swal.fire({ icon: "warning", title: "กรุณาระบุรหัสห้อง", background: "#18181b", color: "#fff" });
      return;
    }

    setJoinSubmitting(true);
    try {
      const res = await fetch(`/api/rooms/${targetId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: joinPasscode.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        // Remember passcode in session storage for this room
        sessionStorage.setItem(`room_passcode_${targetId}`, joinPasscode.trim());
        window.location.href = `/${targetId}`;
      } else {
        Swal.fire({
          icon: "error",
          title: "ไม่สามารถเข้าห้องได้",
          text: data.message || "รหัสเข้าห้องไม่ถูกต้อง",
          background: "#18181b",
          color: "#fff",
        });
      }
    } catch (err) {
      Swal.fire({ icon: "error", title: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ", background: "#18181b", color: "#fff" });
    } finally {
      setJoinSubmitting(false);
    }
  };

  const openJoinForRoom = (room) => {
    if (!room.requiresPasscode) {
      // Direct jump if no passcode required
      window.location.href = `/${room.id}`;
      return;
    }
    setSelectedRoomForJoin(room);
    setJoinRoomId(room.id);
    setJoinPasscode("");
    setShowJoinModal(true);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-fuchsia-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-cyan-600/15 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-fuchsia-500 to-cyan-400 p-[1.5px] shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
              <Music className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
              Restaurant Jukebox
            </h1>
            <p className="text-xs text-zinc-400">ระบบตู้เพลงมัลติรูม (Multi-Room Hub)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {superToken ? (
            <button
              onClick={() => {
                localStorage.removeItem("super_admin_token");
                setSuperToken("");
                Swal.fire({ icon: "info", title: "ออกจากโหมด Super Admin แล้ว", timer: 1200, background: "#18181b", color: "#fff" });
              }}
              className="px-3 py-2 rounded-xl text-xs font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 transition-all flex items-center gap-1.5 shadow-sm"
              title="ออกจากโหมด Super Admin"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Super Admin (Active)</span>
            </button>
          ) : (
            <button
              onClick={() => setShowSuperModal(true)}
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-all"
              title="Super Admin Login"
            >
              <Shield className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => {
              setSelectedRoomForJoin(null);
              setJoinRoomId("");
              setJoinPasscode("");
              setShowJoinModal(true);
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/60 transition-all flex items-center gap-2 shadow-sm"
          >
            <LogIn className="w-4 h-4 text-zinc-400" />
            <span>เข้าร่วมด้วยรหัส</span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 shadow-md shadow-indigo-600/25 transition-all flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>สร้างห้องใหม่</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-5xl w-full mx-auto p-6 flex flex-col justify-center">
        {/* Hero Section */}
        <div className="text-center py-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>ระบบแยกห้องอัจฉริยะ • สแกน QR ทะลุผ่านได้ทันที</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white">
            เลือกห้องเพลง หรือ <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-cyan-400">สร้างห้องใหม่ของคุณ</span>
          </h2>
          <p className="text-zinc-400 text-sm md:text-base max-w-xl mx-auto">
            แต่ละห้องมีคิวเพลง จอแสดงผล และการตั้งค่าแยกอิสระ พร้อมระบบ QR Code Bypass สแกนแล้วเข้าขอเพลงได้ทันที
          </p>

          {/* Quick Action CTA Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto pt-4 text-left">
            <div
              onClick={() => setShowCreateModal(true)}
              className="p-5 rounded-2xl bg-zinc-900/60 border border-indigo-500/30 hover:border-indigo-500/60 transition-all cursor-pointer group hover:bg-zinc-900/90 shadow-lg hover:shadow-indigo-500/10 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">สร้างห้องเพลงใหม่</h3>
                <p className="text-xs text-zinc-400 mt-1">กำหนด Admin PIN และรหัสผ่านเข้าห้องสำหรับร้านหรือกลุ่มเพื่อน</p>
              </div>
            </div>

            <div
              onClick={() => {
                setSelectedRoomForJoin(null);
                setJoinRoomId("");
                setJoinPasscode("");
                setShowJoinModal(true);
              }}
              className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group hover:bg-zinc-900/90 shadow-lg flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 group-hover:scale-110 transition-transform">
                  <KeyRound className="w-6 h-6" />
                </div>
                <ArrowRight className="w-5 h-5 text-zinc-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white group-hover:text-zinc-200 transition-colors">เข้าร่วมห้องด้วยรหัส</h3>
                <p className="text-xs text-zinc-400 mt-1">กรณีไม่มี QR Code พิมพ์รหัสห้องและรหัสผ่านเพื่อเข้าขอเพลง</p>
              </div>
            </div>
          </div>
        </div>

        {/* Active Rooms Grid */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Radio className="w-4 h-4 text-indigo-400" />
              <span>ห้องเพลงที่กำลังเปิดอยู่ ({rooms.length})</span>
            </h3>
            <span className="text-xs text-zinc-500">รีเฟรชอัตโนมัติ</span>
          </div>

          {loadingRooms ? (
            <div className="text-center py-12 text-zinc-500 text-sm">กำลังโหลดรายชื่อห้อง...</div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900/30 rounded-2xl border border-zinc-800/60 text-zinc-500 text-sm">
              ยังไม่มีห้องที่เปิดอยู่ในขณะนี้ กดปุ่ม "สร้างห้องใหม่" ด้านบนเพื่อเริ่มใช้งาน
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  onClick={() => openJoinForRoom(room)}
                  className="p-4 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/80 hover:border-indigo-500/40 transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-base truncate group-hover:text-indigo-300 transition-colors">
                          {room.name}
                        </h4>
                        {room.requiresPasscode ? (
                          <span className="shrink-0 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> มีรหัส
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Unlock className="w-2.5 h-2.5" /> เข้าได้เลย
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 font-mono mt-0.5">#{room.id}</p>
                    </div>

                    <div className="w-8 h-8 rounded-lg bg-zinc-800/60 flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors shrink-0">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Current Playing Song Preview */}
                  <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center gap-3">
                    {room.currentSong?.thumbnail ? (
                      <img
                        src={room.currentSong.thumbnail}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover shrink-0 border border-zinc-800"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                        <Music className="w-4 h-4 text-zinc-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-zinc-300 font-medium truncate">
                        {room.currentSong ? room.currentSong.title : "ยังไม่มีเพลงเล่น"}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {room.currentSong ? room.currentSong.artist : `ในคิว: ${room.queueCount} เพลง`}
                      </p>
                    </div>
                  </div>

                  {/* Direct links: Player / Admin */}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-400 pt-2 border-t border-zinc-800/40">
                    <div className="flex items-center gap-3">
                      <a
                        href={`/${room.id}/player`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-indigo-400 underline decoration-zinc-700 hover:decoration-indigo-400"
                      >
                        จอทีวี (Player)
                      </a>
                      <a
                        href={`/${room.id}/admin`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-rose-400 underline decoration-zinc-700 hover:decoration-rose-400"
                      >
                        จัดการ (Admin)
                      </a>
                    </div>

                    {superToken && room.id !== "main" && (
                      <button
                        onClick={(e) => handleSuperDeleteRoom(room.id, room.name, e)}
                        className="text-rose-400 hover:text-rose-300 px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition text-[10px] font-bold"
                        title="ลบห้องนี้ (สิทธิ์ Super Admin)"
                      >
                        ลบห้อง
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-800/60 py-4 px-6 text-center text-xs text-zinc-500">
        Restaurant Jukebox Multi-Room Edition • รองรับการเล่นเพลงอิสระหลายห้องพร้อมกัน
      </footer>

      {/* ================= MODAL: CREATE ROOM ================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md p-6 relative shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-indigo-400" />
              <span>สร้างห้องเพลงใหม่</span>
            </h3>
            <p className="text-xs text-zinc-400 mb-5">
              กำหนดชื่อห้องและรหัสผ่านเพื่อความปลอดภัยของห้องคุณ
            </p>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  ชื่อห้อง <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น VIP Room 1, โซนบาร์, โต๊ะ 8"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center justify-between">
                  <span>รหัส Admin PIN (4-6 หลัก) <span className="text-rose-400">*</span></span>
                  <span className="text-[10px] text-zinc-500">ใช้สำหรับกดข้าม/จัดคิว/ตั้งค่า</span>
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  placeholder="เช่น 1234"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono tracking-widest focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center justify-between">
                  <span>รหัสผ่านเข้าห้อง (Room Passcode)</span>
                  <span className="text-[10px] text-emerald-400">เว้นว่างได้ถ้าเปิดเสรี</span>
                </label>
                <input
                  type="text"
                  placeholder="กรณีไม่มี QR Code (เว้นว่างได้)"
                  value={roomPasscode}
                  onChange={(e) => setRoomPasscode(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  💡 <b>ข้อแนะนำ:</b> หากเปิดหน้าจอทีวี (Player) แล้วให้ลูกค้าสแกน QR Code ลูกค้าจะทะลุเข้าได้ทันทีโดยไม่ต้องใส่รหัสนี้
                </p>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-600/30"
                >
                  {createSubmitting ? "กำลังสร้าง..." : "สร้างห้องเดี๋ยวนี้"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: JOIN ROOM ================= */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md p-6 relative shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-400" />
              <span>เข้าร่วมห้อง {selectedRoomForJoin ? `"${selectedRoomForJoin.name}"` : ""}</span>
            </h3>
            <p className="text-xs text-zinc-400 mb-5">
              กรอกรหัสผ่านเพื่อเข้าสู่ห้องขอเพลง
            </p>

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              {!selectedRoomForJoin && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    รหัสห้อง (Room ID) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น main, vip-room-1"
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  รหัสผ่านเข้าห้อง (Room Passcode)
                </label>
                <input
                  type="password"
                  autoFocus
                  placeholder="กรอกรหัสเข้าห้อง"
                  value={joinPasscode}
                  onChange={(e) => setJoinPasscode(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={joinSubmitting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-600/30"
                >
                  {joinSubmitting ? "กำลังตรวจสอบ..." : "เข้าสู่ห้อง"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: SUPER ADMIN LOGIN ================= */}
      {showSuperModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-amber-500/30 rounded-3xl w-full max-w-sm p-6 relative shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-400" />
              <span>Super Admin Login</span>
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              เข้าสู่ระบบผู้ดูแลระบบสูงสุดเพื่อจัดการและลบทุกห้อง
            </p>

            <form onSubmit={handleSuperLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  ชื่อผู้ใช้งาน
                </label>
                <input
                  type="text"
                  required
                  placeholder="Username"
                  value={superUsername}
                  onChange={(e) => setSuperUsername(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  รหัสผ่าน
                </label>
                <input
                  type="password"
                  required
                  placeholder="Password"
                  value={superPassword}
                  onChange={(e) => setSuperPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSuperModal(false)}
                  className="flex-1 px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={superSubmitting}
                  className="flex-1 px-4 py-2 rounded-xl text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition-colors font-bold shadow-lg shadow-amber-400/20"
                >
                  {superSubmitting ? "เข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
