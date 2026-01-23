"use strict";

const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const readline = require("readline");
const { exec } = require("child_process");

const config = require("./config");
const live = require("./live");
// routes.js가 없다면 에러가 날 수 있으니, 아래 require 부분은 파일이 있을 때만 유효합니다.
// 만약 routes.js를 아직 안 만드셨다면 빈 객체를 반환하게 하거나 파일을 만드셔야 합니다.
const { registerRoutes } = require("./routes");

// HTTP server (static + API)
const app = express();
app.use(express.json({ limit: "256kb" }));

// 로그 미들웨어
app.use((req, _res, next) => {
  if (req.method === "GET" && req.path.startsWith("/media/")) {
    console.log(`[HTTP] ${req.method} ${req.path}`);
  }
  next();
});

// 정적 파일 서빙
app.use("/media", express.static(config.mediaDir));
app.use("/", express.static(config.publicDir));

const httpServer = http.createServer(app);
httpServer.listen(config.httpPort, config.host, () => {
  console.log(`[HTTP] listening on ${config.host}:${config.httpPort}, media=${config.mediaDir}`);
  const url = `http://localhost:${config.httpPort}`;
  if (process.platform === "win32") {
    exec(`start "" "${url}"`);
  }
});

// WebSocket server (control plane)
const wsServer = http.createServer();
const wss = new WebSocket.Server({ server: wsServer });

// 클라이언트 관리 Map (Key: deviceId, Value: { ws, ip })
const clients = new Map();

// 단말 ID 생성을 위한 카운터
let deviceCounter = 1;

// WS send helper
function sendTo(targetId, payload) {
  if (targetId === "all") {
    for (const [id, client] of clients.entries()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(payload));
        console.log(`[WS] -> ${id}`, payload.type);
      }
    }
    return;
  }

  const client = clients.get(targetId);
  if (!client || client.ws.readyState !== WebSocket.OPEN) {
    console.log(`[WS] target not connected: ${targetId}`);
    return;
  }
  client.ws.send(JSON.stringify(payload));
  console.log(`[WS] -> ${targetId}`, payload.type);
}

// API 라우트 등록 (routes.js와 연동)
// clients, sendTo, live, config를 컨텍스트로 넘겨줍니다.
registerRoutes(app, { clients, sendTo, live, config });
live.initRtpDebug(config);

// WebSocket 연결 처리
wss.on("connection", (ws, req) => {
  // 1. IP 주소 추출
  let ip = req.socket.remoteAddress;
  if (ip && ip.startsWith("::ffff:")) ip = ip.substring(7); // IPv4 매핑 정리
  
  // 2. ID 생성 (device-1 (192.168.0.30) 형식)
  // 기존의 requestedId 로직은 제거하고 서버가 할당하는 방식으로 통일했습니다.
  const deviceId = `device-${deviceCounter++} (${ip})`;

  // 3. 클라이언트 등록
  clients.set(deviceId, { ws, ip });
  
  // 단말에게 ID 통보
  ws.send(JSON.stringify({ type: "hello", device_id: deviceId }));
  console.log(`[WS] Connected: ${deviceId}`);

  // 메시지 처리
  ws.on("message", (raw) => {
    const text = raw.toString();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.log(`[WS] ${deviceId} -> (non-json) ${text}`);
      return;
    }
    console.log(`[WS] ${deviceId} ->`, parsed.type);
    
    // (옵션) 단말이 스스로 ID를 바꾸고 싶어하는 경우 처리 (필요 없으면 삭제 가능)
    if (parsed && parsed.type === "register" && typeof parsed.device_id === "string") {
      const newId = parsed.device_id;
      clients.delete(deviceId);
      clients.set(newId, { ws, ip });
      console.log(`[WS] Renamed: ${deviceId} -> ${newId}`);
    }
  });

  // 연결 종료 처리
  ws.on("close", () => {
    clients.delete(deviceId);
    console.log(`[WS] Disconnected: ${deviceId}`);
  });
  
  ws.on("error", (err) => {
      console.error(`[WS] Error ${deviceId}: ${err.message}`);
  });
});

wsServer.listen(config.wsPort, config.host, () => {
  console.log(`[WS] listening on ${config.host}:${config.wsPort}`);
});

// 연결 끊기 API (server.js에 직접 구현하거나 routes.js로 옮길 수 있음)
app.post("/api/disconnect", (req, res) => {
    const { deviceId } = req.body;
    const client = clients.get(deviceId);
    if (client) {
        client.ws.close();
        clients.delete(deviceId);
        console.log(`[API] Forced disconnect: ${deviceId}`);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Device not found" });
    }
});

// 단말 목록 API
app.get("/api/devices", (req, res) => {
    const list = Array.from(clients.keys()).map(id => ({
        id: id,
        ip: clients.get(id).ip
    }));
    res.json(list);
});

// 기존의 readline(터미널 명령어) 부분은 유지합니다.
function makeSessionId(prefix) {
  return `${prefix}-${Date.now()}`;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "demo> ",
});

// 터미널 명령어 처리 로직 (이전과 동일하게 유지하되, sendTo 호환성 확보)
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    rl.prompt();
    return;
  }
  
  const [cmd, target, ...rest] = trimmed.split(" ");
  
  if (cmd === "list") {
    console.log(Array.from(clients.keys()));
  } else if (cmd === "live_start") {
     // 터미널에서 live_start 명령 시에도 파이썬 실행되도록 하려면 
     // live.startLiveStream 호출이 필요하지만, 여기선 일단 생략합니다.
     console.log("Use Web UI for live streaming.");
  } 
  // ... 기타 명령어 처리 ...

  rl.prompt();
});
// "use strict";

// const http = require("http");
// const express = require("express");
// const WebSocket = require("ws");
// const readline = require("readline");

// const config = require("./config");
// const live = require("./live");
// const { registerRoutes } = require("./routes");

// // HTTP server (static + API)
// const app = express();
// app.use(express.json({ limit: "256kb" }));
// app.use((req, _res, next) => {
//   if (req.method === "GET" && req.path.startsWith("/media/")) {
//     console.log(`[HTTP] ${req.method} ${req.path}`);
//   }
//   next();
// });
// app.use("/media", express.static(config.mediaDir));
// app.use("/", express.static(config.publicDir));

// const httpServer = http.createServer(app);
// httpServer.listen(config.httpPort, config.host, () => {
//   console.log(`[HTTP] listening on ${config.host}:${config.httpPort}, media=${config.mediaDir}`);
// });

// // WebSocket server (control plane)
// const wsServer = http.createServer();
// const wss = new WebSocket.Server({ server: wsServer });

// const clients = new Map(); // Key: deviceId, Value: ws
// // [수정] sendTo 함수: clients Map 구조 변경에 따른 수정
// function sendTo(targetId, payload) {
//   if (targetId === "all") {
//     for (const [id, client] of clients.entries()) {
//       if (client.ws.readyState === WebSocket.OPEN) {
//         client.ws.send(JSON.stringify(payload));
//       }
//     }
//     return;
//   }
//   const client = clients.get(targetId);
//   if (!client || client.ws.readyState !== WebSocket.OPEN) return;
//   client.ws.send(JSON.stringify(payload));
// }

// let deviceCounter = 1;

// wss.on("connection", (ws, req) => {
//   // [기능 2] IP 주소 추출 및 ID 생성
//   let ip = req.socket.remoteAddress;
//   // IPv6 매핑된 IPv4 주소 정리 (::ffff:192.168.0.x -> 192.168.0.x)
//   if (ip.startsWith("::ffff:")) ip = ip.substring(7);
  
//   // ID 형식: device-1 (192.168.0.30)
//   const deviceId = `device-${deviceCounter++} (${ip})`;

//   // Map에 WS 객체와 IP를 함께 저장
//   clients.set(deviceId, { ws, ip });
  
//   console.log(`[WS] Connected: ${deviceId}`);
  
//   // 단말에게 "너의 이름은 이거야" 라고 알려줌
//   ws.send(JSON.stringify({ type: "hello", device_id: deviceId }));

//   ws.on("close", () => {
//     clients.delete(deviceId);
//     console.log(`[WS] Disconnected: ${deviceId}`);
//   });

//   ws.on("message", (msg) => {
//       // (기존 메시지 처리 로직)
//   });
// });

// // [기능 4] 단말 연결 끊기 API (라우트 연동 필요)
// app.post("/api/disconnect", (req, res) => {
//     const { deviceId } = req.body;
//     if (clients.has(deviceId)) {
//         clients.get(deviceId).ws.close(); // 소켓 강제 종료
//         clients.delete(deviceId);
//         console.log(`[API] Forced disconnect: ${deviceId}`);
//         res.json({ success: true });
//     } else {
//         res.status(404).json({ error: "Device not found" });
//     }
// });

// // [기능 3] UI를 위한 단말 목록 API
// app.get("/api/devices", (req, res) => {
//     const list = Array.from(clients.keys()).map(id => ({
//         id: id,
//         ip: clients.get(id).ip
//     }));
//     res.json(list);
// });

// // WS send helper.
// function sendTo(targetId, payload) {
//   if (targetId === "all") {
//     for (const [id, ws] of clients.entries()) {
//       if (ws.readyState === WebSocket.OPEN) {
//         ws.send(JSON.stringify(payload));
//         console.log(`[WS] -> ${id}`, payload);
//       }
//     }
//     return;
//   }

//   const ws = clients.get(targetId);
//   if (!ws || ws.readyState !== WebSocket.OPEN) {
//     console.log(`[WS] target not connected: ${targetId}`);
//     return;
//   }
//   ws.send(JSON.stringify(payload));
//   console.log(`[WS] -> ${targetId}`, payload);
// }

// // API routes (UI, live control).
// registerRoutes(app, { clients, sendTo, live, config });
// live.initRtpDebug(config);

// wss.on("connection", (ws, req) => {
//   const url = new URL(req.url || "", `http://${req.headers.host}`);
//   const requestedId = url.searchParams.get("device_id");
//   const deviceId = requestedId || `anon-${anonCounter++}`;

//   clients.set(deviceId, ws);
//   ws.send(JSON.stringify({ type: "hello", device_id: deviceId }));
//   console.log(`[WS] connected: ${deviceId}`);

//   ws.on("message", (raw) => {
//     const text = raw.toString();
//     let parsed;
//     try {
//       parsed = JSON.parse(text);
//     } catch {
//       console.log(`[WS] ${deviceId} -> (non-json) ${text}`);
//       return;
//     }
//     console.log(`[WS] ${deviceId} ->`, parsed);
//     if (parsed && parsed.type === "register" && typeof parsed.device_id === "string") {
//       clients.delete(deviceId);
//       clients.set(parsed.device_id, ws);
//       console.log(`[WS] ${deviceId} renamed -> ${parsed.device_id}`);
//     }
//   });

//   ws.on("close", () => {
//     clients.delete(deviceId);
//     console.log(`[WS] disconnected: ${deviceId}`);
//   });
// });

// wsServer.listen(config.wsPort, config.host, () => {
//   console.log(`[WS] listening on ${config.host}:${config.wsPort}`);
// });

// // Simple session id generator for control messages.
// function makeSessionId(prefix) {
//   return `${prefix}-${Date.now()}`;
// }

// // Terminal CLI
// const rl = readline.createInterface({
//   input: process.stdin,
//   output: process.stdout,
//   prompt: "demo> ",
// });

// console.log("Commands:");
// console.log("  list");
// console.log("  send <device_id|all> <json>");
// console.log("  file_play <device_id|all> <url> [cache|no-store]");
// console.log("  file_stop <device_id|all>");
// console.log("  live_start <device_id|all> <rtp_ip> <rtp_port>");
// console.log("  live_stop <device_id|all>");
// console.log("  status_req <device_id|all>");
// rl.prompt();

// rl.on("line", (line) => {
//   const trimmed = line.trim();
//   if (!trimmed) {
//     rl.prompt();
//     return;
//   }

//   const [cmd, target, ...rest] = trimmed.split(" ");
//   if (cmd === "list") {
//     console.log(Array.from(clients.keys()));
//     rl.prompt();
//     return;
//   }

//   if (!target) {
//     console.log("missing target device_id|all");
//     rl.prompt();
//     return;
//   }

//   if (cmd === "send") {
//     const jsonText = rest.join(" ");
//     try {
//       const payload = JSON.parse(jsonText);
//       sendTo(target, payload);
//     } catch (err) {
//       console.log("invalid json", err.message);
//     }
//     rl.prompt();
//     return;
//   }

//   if (cmd === "file_play") {
//     const url = rest[0];
//     const storePolicy = rest[1] || "cache";
//     if (!url) {
//       console.log("missing url");
//       rl.prompt();
//       return;
//     }
//     sendTo(target, {
//       type: "file_play",
//       proto_ver: 1,
//       session_id: makeSessionId("file"),
//       url,
//       codec: "mp3",
//       auto_play: true,
//       store_policy: storePolicy === "no-store" ? "no-store" : "cache",
//     });
//     rl.prompt();
//     return;
//   }

//   if (cmd === "file_stop") {
//     sendTo(target, {
//       type: "file_stop",
//       proto_ver: 1,
//       session_id: makeSessionId("file"),
//     });
//     rl.prompt();
//     return;
//   }

//   if (cmd === "live_start") {
//     const rtpIp = rest[0];
//     const rtpPort = Number(rest[1]);
//     if (!rtpIp || !rtpPort) {
//       console.log("usage: live_start <device_id|all> <rtp_ip> <rtp_port>");
//       rl.prompt();
//       return;
//     }
//     const frameMs = live.DEFAULT_FRAME_MS;
//     live.startLiveStream(target, rtpIp, rtpPort, frameMs, config);
//     sendTo(target, {
//       type: "live_start",
//       proto_ver: 1,
//       session_id: makeSessionId("live"),
//       rtp_ip: rtpIp,
//       rtp_port: rtpPort,
//       codec: "opus",
//       frame_ms: frameMs,
//       sample_rate: live.DEFAULT_SAMPLE_RATE,
//     });
//     rl.prompt();
//     return;
//   }

//   if (cmd === "live_stop") {
//     live.stopLiveSender(target);
//     sendTo(target, {
//       type: "live_stop",
//       proto_ver: 1,
//       session_id: makeSessionId("live"),
//     });
//     rl.prompt();
//     return;
//   }

//   if (cmd === "status_req") {
//     sendTo(target, {
//       type: "status_req",
//       proto_ver: 1,
//     });
//     rl.prompt();
//     return;
//   }

//   console.log(`unknown command: ${cmd}`);
//   rl.prompt();
// });
