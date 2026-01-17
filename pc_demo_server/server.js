"use strict";

const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const readline = require("readline");

const config = require("./config");
const live = require("./live");
const { registerRoutes } = require("./routes");

// HTTP server (static + API)
const app = express();
app.use(express.json({ limit: "256kb" }));
app.use((req, _res, next) => {
  if (req.method === "GET" && req.path.startsWith("/media/")) {
    console.log(`[HTTP] ${req.method} ${req.path}`);
  }
  next();
});
app.use("/media", express.static(config.mediaDir));
app.use("/", express.static(config.publicDir));

const httpServer = http.createServer(app);
httpServer.listen(config.httpPort, config.host, () => {
  console.log(`[HTTP] listening on ${config.host}:${config.httpPort}, media=${config.mediaDir}`);
});

// WebSocket server (control plane)
const wsServer = http.createServer();
const wss = new WebSocket.Server({ server: wsServer });

const clients = new Map();
let anonCounter = 1;

// WS send helper.
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

// API routes (UI, live control).
registerRoutes(app, { clients, sendTo, live, config });

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

wsServer.listen(config.wsPort, config.host, () => {
  console.log(`[WS] listening on ${config.host}:${config.wsPort}`);
});

// Simple session id generator for control messages.
function makeSessionId(prefix) {
  return `${prefix}-${Date.now()}`;
}

// Terminal CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "demo> ",
});

console.log("Commands:");
console.log("  list");
console.log("  send <device_id|all> <json>");
console.log("  file_play <device_id|all> <url> [cache|no-store]");
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
    const storePolicy = rest[1] || "cache";
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
      store_policy: storePolicy === "no-store" ? "no-store" : "cache",
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
    const frameMs = live.DEFAULT_FRAME_MS;
    live.startLiveStream(target, rtpIp, rtpPort, frameMs, config);
    sendTo(target, {
      type: "live_start",
      proto_ver: 1,
      session_id: makeSessionId("live"),
      rtp_ip: rtpIp,
      rtp_port: rtpPort,
      codec: "opus",
      frame_ms: frameMs,
      sample_rate: live.DEFAULT_SAMPLE_RATE,
    });
    rl.prompt();
    return;
  }

  if (cmd === "live_stop") {
    live.stopLiveSender(target);
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
