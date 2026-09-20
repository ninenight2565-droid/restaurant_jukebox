const { io } = require("socket.io-client");
const http = require("http");

const socket = io("http://127.0.0.1:8888");

socket.on("connect", () => {
  console.log("✅ Socket.io Connected to Node.js backend!");

  // Request song
  socket.emit("song:request", {
    song_info: {
      video_id: "AlV8TgZAb9Y",
      title: "เสแสร้ง (Pretend)",
      artist: "Paper Planes",
      duration: 224,
      duration_str: "3:44",
      thumbnail: "https://i.ytimg.com/vi/AlV8TgZAb9Y/hqdefault.jpg"
    },
    user_name: "ลูกค้าโต๊ะ 5",
    table_no: "5",
    user_id: "user_test_node"
  }, (res) => {
    console.log("✅ Song Request Ack Received:", res);
  });
});

socket.on("state:update", (state) => {
  console.log("⚡ INSTANT BROADCAST RECEIVED!");
  console.log("Current Playing:", state.current_song?.title);
  console.log("Queue Length:", state.queue?.length);
  if (state.current_song) {
    console.log("🎉 SUCCESS: Instant Real-time auto-play working!");
    socket.disconnect();
    process.exit(0);
  }
});
