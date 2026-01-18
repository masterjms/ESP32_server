"use strict";

const dgram = require("dgram");
const { spawn } = require("child_process");

const RTP_PT_OPUS = 111;
const RTP_SSRC = 0x12345678;
const DEFAULT_FRAME_MS = 20;
const DEFAULT_SAMPLE_RATE = 16000;
const DUMMY_PAYLOAD_SIZE = 40;
const LIVE_BITRATE = "32000";

// Active LIVE senders keyed by target id.
const liveSenders = new Map();

// Build minimal RTP header + payload (Opus PT=111).
function buildRtpPacket(seq, timestamp, payload) {
  const header = Buffer.alloc(12);
  header[0] = 0x80;
  header[1] = RTP_PT_OPUS & 0x7f;
  header.writeUInt16BE(seq & 0xffff, 2);
  header.writeUInt32BE(timestamp >>> 0, 4);
  header.writeUInt32BE(RTP_SSRC >>> 0, 8);
  return Buffer.concat([header, payload]);
}

// Dummy sender for debug-only RTP flow.
function startDummySender(key, rtpIp, rtpPort, frameMs) {
  if (liveSenders.has(key)) {
    console.log(`[RTP] sender already running for ${key}`);
    return;
  }

  const socket = dgram.createSocket("udp4");
  let seq = 1;
  let timestamp = 0;
  const frameSamples = Math.round((DEFAULT_SAMPLE_RATE * frameMs) / 1000);
  const payload = Buffer.alloc(DUMMY_PAYLOAD_SIZE, 0x00);

  const interval = setInterval(() => {
    const packet = buildRtpPacket(seq, timestamp, payload);
    socket.send(packet, rtpPort, rtpIp);
    seq = (seq + 1) & 0xffff;
    timestamp = (timestamp + frameSamples) >>> 0;
  }, frameMs);

  liveSenders.set(key, { type: "dummy", socket, interval });
  console.log(`[RTP] sending dummy opus to ${rtpIp}:${rtpPort} (${frameMs}ms)`);
}

// FFmpeg sender: mic -> Opus -> RTP.
function startFfmpegSender(key, rtpIp, rtpPort, frameMs, config) {
  if (!config.liveInputDevice) {
    console.log("[RTP] LIVE_INPUT_DEVICE is required for ffmpeg mode");
    return;
  }
  if (liveSenders.has(key)) {
    console.log(`[RTP] sender already running for ${key}`);
    return;
  }

  const inputDevice = normalizeInputDevice(config.liveInputDevice);
  const inputArgs = ["-f", config.liveInputFormat, "-i", inputDevice];
  const args = [
    "-hide_banner",
    "-loglevel",
    "info",
    ...inputArgs,
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(DEFAULT_SAMPLE_RATE),
    "-c:a",
    "libopus",
    "-application",
    "lowdelay",
    "-b:a",
    LIVE_BITRATE,
    "-vbr",
    "constrained",
    "-frame_duration",
    String(frameMs),
    "-f",
    "rtp",
    `rtp://${rtpIp}:${rtpPort}`,
  ];

  const proc = spawn(config.ffmpegBin, args, { stdio: ["ignore", "ignore", "pipe"] });
  proc.on("error", (err) => {
    console.log(`[FFMPEG] spawn error for ${key}: ${err.message}`);
    liveSenders.delete(key);
  });
  proc.stderr.on("data", (buf) => {
    const text = buf.toString().trim();
    if (text) {
      console.log(`[FFMPEG] ${text}`);
    }
  });
  proc.on("exit", (code, signal) => {
    console.log(`[FFMPEG] exited for ${key} (code=${code}, signal=${signal})`);
    liveSenders.delete(key);
  });

  liveSenders.set(key, { type: "ffmpeg", proc });
  console.log(`[RTP] sending opus via ffmpeg to ${rtpIp}:${rtpPort} (${frameMs}ms)`);
}

// Entry point for LIVE stream start.
function startLiveStream(key, rtpIp, rtpPort, frameMs, config) {
  if (config.liveMode === "dummy") {
    startDummySender(key, rtpIp, rtpPort, frameMs);
    return;
  }
  startFfmpegSender(key, rtpIp, rtpPort, frameMs, config);
}

function normalizeInputDevice(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/^audio=\"(.+)\"$/);
  if (match) {
    return `audio=${match[1]}`;
  }
  return trimmed;
}

// Stop one or all LIVE senders.
function stopLiveSender(key) {
  if (key === "all") {
    for (const [k, sender] of Array.from(liveSenders.entries())) {
      if (sender.type === "dummy") {
        clearInterval(sender.interval);
        sender.socket.close();
      } else if (sender.type === "ffmpeg") {
        sender.proc.kill("SIGINT");
      }
      liveSenders.delete(k);
      console.log(`[RTP] stopped sender for ${k}`);
    }
    return;
  }
  const sender = liveSenders.get(key);
  if (!sender) {
    if (liveSenders.size > 0) {
      console.log(`[RTP] sender not found for ${key}, stopping all`);
      stopLiveSender("all");
      return;
    }
    console.log(`[RTP] sender not found for ${key}`);
    return;
  }
  if (sender.type === "dummy") {
    clearInterval(sender.interval);
    sender.socket.close();
  } else if (sender.type === "ffmpeg") {
    sender.proc.kill("SIGINT");
  }
  liveSenders.delete(key);
  console.log(`[RTP] stopped sender for ${key}`);
}

// Aggregate LIVE status for UI polling.
function getLiveStatus(target) {
  const entries =
    target === "all"
      ? Array.from(liveSenders.entries())
      : liveSenders.has(target)
      ? [[target, liveSenders.get(target)]]
      : [];
  return { running: entries.length > 0 };
}

module.exports = {
  DEFAULT_FRAME_MS,
  DEFAULT_SAMPLE_RATE,
  startLiveStream,
  stopLiveSender,
  getLiveStatus,
};
