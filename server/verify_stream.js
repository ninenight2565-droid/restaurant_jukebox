const http = require("http");

http.get("http://localhost:8888/api/audio-url/dXVnANYk0Mo", (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    const parsed = JSON.parse(data);
    console.log("Stream Endpoint Status:", parsed.status);
    console.log("Audio URL extracted:", parsed.audio_url ? parsed.audio_url.substring(0, 70) + "..." : "none");
    process.exit(0);
  });
}).on("error", (e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
