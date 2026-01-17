"use strict";

const os = require("os");

// Resolve local IPv4 addresses for UI hints.
function getIpv4Addresses() {
  const ifaces = os.networkInterfaces();
  const addresses = [];
  for (const entries of Object.values(ifaces)) {
    for (const info of entries || []) {
      if (info.family === "IPv4" && !info.internal) {
        addresses.push(info.address);
      }
    }
  }
  return addresses;
}

// Register HTTP API routes used by the UI.
function registerRoutes(app, { clients, sendTo, live, config }) {
  app.get("/api/clients", (_req, res) => {
    res.json({ clients: Array.from(clients.keys()) });
  });

  app.get("/api/server_info", (_req, res) => {
    res.json({
      public_host: config.publicHost,
      addresses: getIpv4Addresses(),
      http_port: config.httpPort,
      ws_port: config.wsPort,
    });
  });

  app.get("/api/live_config", (_req, res) => {
    res.json({
      input_format: config.liveInputFormat,
      input_device: config.liveInputDevice,
    });
  });

  app.post("/api/live_config", (req, res) => {
    const { input_format, input_device } = req.body || {};
    if (typeof input_format === "string" && input_format) {
      config.liveInputFormat = input_format;
    }
    if (typeof input_device === "string") {
      config.liveInputDevice = input_device;
    }
    res.json({ ok: true, config: { input_format: config.liveInputFormat, input_device: config.liveInputDevice } });
  });

  app.get("/api/live_status", (req, res) => {
    const target = req.query.target || "all";
    const status = live.getLiveStatus(target);
    res.json({ running: status.running });
  });

  app.post("/api/send", (req, res) => {
    const { target, payload } = req.body || {};
    if (!target || !payload || typeof payload !== "object") {
      res.status(400).json({ error: "missing target or payload" });
      return;
    }

    if (payload.type === "live_start") {
      const rtpIp = payload.rtp_ip;
      const rtpPort = Number(payload.rtp_port);
      const frameMs = Number(payload.frame_ms) || live.DEFAULT_FRAME_MS;
      if (rtpIp && rtpPort) {
        live.startLiveStream(target, rtpIp, rtpPort, frameMs, config);
      }
    }

    if (payload.type === "live_stop") {
      live.stopLiveSender(target);
    }

    sendTo(target, payload);
    res.json({ ok: true });
  });
}

module.exports = { registerRoutes };
