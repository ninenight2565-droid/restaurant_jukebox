const { getDirectAudioUrl } = require("./audioExtractor");

console.log("Testing audio extractor for videoId dXVnANYk0Mo...");
getDirectAudioUrl("dXVnANYk0Mo")
  .then(url => {
    console.log("✅ SUCCESS! Extracted Direct Audio URL:", url.substring(0, 70) + "...");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ Error:", err.message);
    process.exit(1);
  });
