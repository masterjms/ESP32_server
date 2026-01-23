"use strict";

const path = require("path");

// Centralized env/config used by server, routes, and live modules.
const baseDir = process.pkg ? path.dirname(process.execPath) : __dirname;

const config = {
  httpPort: Number(process.env.HTTP_PORT || 8080),
  wsPort: Number(process.env.WS_PORT || 9001),
  host: process.env.HOST || "0.0.0.0",
  publicHost: process.env.PUBLIC_HOST || "",
  liveMode: process.env.LIVE_MODE || "ffmpeg",
  micSenderBin: process.env.MIC_SENDER_BIN || "",
  ffmpegBin: process.env.FFMPEG_BIN || "ffmpeg",
  liveInputFormat:
    process.env.LIVE_INPUT_FORMAT ||
    (process.platform === "win32"
      ? "dshow"
      : process.platform === "darwin"
      ? "avfoundation"
      : "alsa"),
  liveInputDevice: process.env.LIVE_INPUT_DEVICE || "",
  rtpDebug: process.env.RTP_DEBUG === "1",
  rtpDebugPort: Number(process.env.RTP_DEBUG_PORT || 4000),
  mediaDir: process.env.MEDIA_DIR || path.join(baseDir, "media"),
  publicDir: process.env.PUBLIC_DIR || path.join(baseDir, "public"),
};

module.exports = config;
