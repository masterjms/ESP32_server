"use strict";

const path = require("path");

// Centralized env/config used by server, routes, and live modules.
const config = {
  httpPort: Number(process.env.HTTP_PORT || 8080),
  wsPort: Number(process.env.WS_PORT || 9001),
  host: process.env.HOST || "0.0.0.0",
  publicHost: process.env.PUBLIC_HOST || "",
  liveMode: process.env.LIVE_MODE || "ffmpeg",
  ffmpegBin: process.env.FFMPEG_BIN || "ffmpeg",
  liveInputFormat:
    process.env.LIVE_INPUT_FORMAT ||
    (process.platform === "win32"
      ? "dshow"
      : process.platform === "darwin"
      ? "avfoundation"
      : "alsa"),
  liveInputDevice: process.env.LIVE_INPUT_DEVICE || "",
  mediaDir: process.env.MEDIA_DIR || path.join(__dirname, "media"),
  publicDir: process.env.PUBLIC_DIR || path.join(__dirname, "public"),
};

module.exports = config;
