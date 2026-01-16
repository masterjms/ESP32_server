"use strict";

const path = require("path");
const http = require("http");
const dgram = require("dgram");
const express = require("express");
const WebSocket = require("ws");
const readline = require("readline");

const HTTP_PORT = Number(process.env.HTTP_PORT || 8080);
const WS_PORT = Number(process.env.WS_PORT || 9001);
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, "media");
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, "public");

const app = express();
app.use("/media", express.static(MEDIA_DIR));
app.use("/", express.static(PUBLIC_DIR));

app.get("/api/clients", (_req, res) => {
  res.json({ clients: Array.from(clients.keys()) });
});

const httpServer = http.createServer(app);
httpServer.listen(HTTP_PORT, () => {
  console.log(`[HTTP] listening on :${HTTP_PORT}, media=${MEDIA_DIR}`);
});

const wsServer = http.createServer();
const wss = new WebSocket.Server({ server: wsServer });

const clients = new Map();
let anonCounter = 1;
const liveSenders = new Map();
const RTP_PT_OPUS = 111;
const RTP_SSRC = 0x12345678;
const DEFAULT_FRAME_MS = 20;
const DEFAULT_SAMPLE_RATE = 16000;
const DUMMY_PAYLOAD_SIZE = 40;

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const requestedId = url.searchParams.get("device_id");
  const deviceId = requestedId || `anon-${anonCounter++}`;

  clients.set(deviceId, ws);
  ws.send(JSON.stringify({ type: "hello", device_id: deviceId }));
  console.log(`[WS] connected: ${deviceId}`);

  ws.on("message", (raw) => {
    const text = raw.toString();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.log(`[WS] ${deviceId} -> (non-json) ${text}`);
      return;
    }
    console.log(`[WS] ${deviceId} ->`, parsed);
    if (parsed && parsed.type === "register" && typeof parsed.device_id === "string") {
      clients.delete(deviceId);
      clients.set(parsed.device_id, ws);
      console.log(`[WS] ${deviceId} renamed -> ${parsed.device_id}`);
    }
  });

  ws.on("close", () => {
    clients.delete(deviceId);
    console.log(`[WS] disconnected: ${deviceId}`);
  });
});

wsServer.listen(WS_PORT, () => {
  console.log(`[WS] listening on :${WS_PORT}`);
});

function sendTo(targetId, payload) {
  if (targetId === "all") {
    for (const [id, ws] of clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
        console.log(`[WS] -> ${id}`, payload);
      }
    }
    return;
  }

  const ws = clients.get(targetId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log(`[WS] target not connected: ${targetId}`);
    return;
  }
  ws.send(JSON.stringify(payload));
  console.log(`[WS] -> ${targetId}`, payload);
}

function makeSessionId(prefix) {
  return `${prefix}-${Date.now()}`;
}

function buildRtpPacket(seq, timestamp, payload) {
  const header = Buffer.alloc(12);
  header[0] = 0x80;
  header[1] = RTP_PT_OPUS & 0x7f;
  header.writeUInt16BE(seq & 0xffff, 2);
  header.writeUInt32BE(timestamp >>> 0, 4);
  header.writeUInt32BE(RTP_SSRC >>> 0, 8);
  return Buffer.concat([header, payload]);
}

function startLiveSender(key, rtpIp, rtpPort, frameMs) {
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

  liveSenders.set(key, { socket, interval });
  console.log(`[RTP] sending dummy opus to ${rtpIp}:${rtpPort} (${frameMs}ms)`);
}

function stopLiveSender(key) {
  if (key === "all") {
    for (const k of Array.from(liveSenders.keys())) {
      stopLiveSender(k);
    }
    return;
  }
  const sender = liveSenders.get(key);
  if (!sender) {
    console.log(`[RTP] sender not found for ${key}`);
    return;
  }
  clearInterval(sender.interval);
  sender.socket.close();
  liveSenders.delete(key);
  console.log(`[RTP] stopped sender for ${key}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "demo> ",
});

console.log("Commands:");
console.log("  list");
console.log("  send <device_id|all> <json>");
console.log("  file_play <device_id|all> <url>");
console.log("  file_stop <device_id|all>");
console.log("  live_start <device_id|all> <rtp_ip> <rtp_port>");
console.log("  live_stop <device_id|all>");
console.log("  status_req <device_id|all>");
rl.prompt();

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    rl.prompt();
    return;
  }

  const [cmd, target, ...rest] = trimmed.split(" ");
  if (cmd === "list") {
    console.log(Array.from(clients.keys()));
    rl.prompt();
    return;
  }

  if (!target) {
    console.log("missing target device_id|all");
    rl.prompt();
    return;
  }

  if (cmd === "send") {
    const jsonText = rest.join(" ");
    try {
      const payload = JSON.parse(jsonText);
      sendTo(target, payload);
    } catch (err) {
      console.log("invalid json", err.message);
    }
    rl.prompt();
    return;
  }

  if (cmd === "file_play") {
    const url = rest[0];
    if (!url) {
      console.log("missing url");
      rl.prompt();
      return;
    }
    sendTo(target, {
      type: "file_play",
      proto_ver: 1,
      session_id: makeSessionId("file"),
      url,
      codec: "mp3",
      auto_play: true,
      store_policy: "cache",
    });
    rl.prompt();
    return;
  }

  if (cmd === "file_stop") {
    sendTo(target, {
      type: "file_stop",
      proto_ver: 1,
      session_id: makeSessionId("file"),
    });
    rl.prompt();
    return;
  }

  if (cmd === "live_start") {
    const rtpIp = rest[0];
    const rtpPort = Number(rest[1]);
    if (!rtpIp || !rtpPort) {
      console.log("usage: live_start <device_id|all> <rtp_ip> <rtp_port>");
      rl.prompt();
      return;
    }
    const frameMs = DEFAULT_FRAME_MS;
    startLiveSender(target, rtpIp, rtpPort, frameMs);
    sendTo(target, {
      type: "live_start",
      proto_ver: 1,
      session_id: makeSessionId("live"),
      rtp_ip: rtpIp,
      rtp_port: rtpPort,
      codec: "opus",
      frame_ms: frameMs,
      sample_rate: DEFAULT_SAMPLE_RATE,
    });
    rl.prompt();
    return;
  }

  if (cmd === "live_stop") {
    stopLiveSender(target);
    sendTo(target, {
      type: "live_stop",
      proto_ver: 1,
      session_id: makeSessionId("live"),
    });
    rl.prompt();
    return;
  }

  if (cmd === "status_req") {
    sendTo(target, {
      type: "status_req",
      proto_ver: 1,
    });
    rl.prompt();
    return;
  }

  console.log(`unknown command: ${cmd}`);
  rl.prompt();
});
