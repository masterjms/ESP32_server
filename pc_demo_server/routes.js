"use strict";

module.exports.registerRoutes = function(app, ctx) {
    const { clients, sendTo, live, config } = ctx;

    // [API] 오디오 입력 장치 목록 조회
    app.get("/api/audio_devices", (req, res) => {
      const { spawn } = require("child_process");
      const path = require("path");
      const fs = require("fs");

      const isPkg = !!process.pkg;
      const baseDir = isPkg ? path.dirname(process.execPath) : process.cwd();
      const exeName = process.platform === "win32" ? "mic_sender.exe" : "mic_sender";
      const exePath = path.join(baseDir, exeName);
      const pyPath = path.join(baseDir, "mic_sender.py");

      let cmd;
      let args;
      if (fs.existsSync(exePath)) {
        cmd = exePath;
        args = ["--list_devices"];
      } else {
        cmd = process.platform === "win32" ? "python" : "python3";
        args = [pyPath, "--list_devices"];
      }

      console.log(`[AudioDevices] mic_sender path: ${cmd}`);
      const proc = spawn(cmd, args, { cwd: baseDir });
      
      let output = "";
      proc.stdout.on("data", (data) => { output += data.toString("utf8"); });
      proc.on("close", () => {
          try {
              const devices = JSON.parse(output);
              res.json(devices);
          } catch (e) {
              res.status(500).json({ error: "Failed to parse devices" });
          }
      });
    });

    // [API] 라이브 시작
    app.post("/api/live_start", (req, res) => {
        const { deviceId, ip, rtpPort, volume } = req.body;
        
        // 1. ESP32에게 보낼 완벽한 명령 패킷 생성
        const payload = {
            type: "live_start",
            proto_ver: 1,                  // [중요] 프로토콜 버전
            session_id: "live-001", // [중요] 세션 ID 고정
            rtp_ip: ip,
            rtp_port: rtpPort,
            sample_rate: 16000,
            codec: "opus",
            frame_ms: 20
        };

        // 2. 명령 전송
        sendTo(deviceId, payload);

        // 3. 파이썬 송출기 실행
        live.startLiveStream(deviceId, ip, rtpPort, 20, config, volume);

        res.json({ success: true });
    });

    // [API] 라이브 중지
    app.post("/api/live_stop", (req, res) => {
        const { deviceId } = req.body;

        live.stopLiveSender(deviceId);

        sendTo(deviceId, {
            type: "live_stop",
            proto_ver: 1,
            session_id: "live-001"
        });

        res.json({ success: true });
    });

    // [API] 파일 재생
    app.post("/api/file_play", (req, res) => {
        // UI에서는 url과 store_policy만 보내주면 됨
        const { deviceId, url, store_policy } = req.body;

        const payload = {
            type: "file_play",
            proto_ver: 1,                    // [복구됨]
            session_id: `file-${Date.now()}`,// [복구됨]
            url: url,
            codec: "mp3",
            auto_play: true,
            store_policy: store_policy || "cache" // 없으면 기본값 cache
        };

        sendTo(deviceId, payload);
        res.json({ success: true });
    });
    
    // [API] 파일 중지
    app.post("/api/file_stop", (req, res) => {
        const { deviceId } = req.body;
        sendTo(deviceId, { 
            type: "file_stop",
            proto_ver: 1,
            session_id: `file-${Date.now()}`
        });
        res.json({ success: true });
    });

    // [API] 서버 정보
    app.get("/api/server_info", (req, res) => {
        res.json({
            http_port: config.httpPort,
            ws_port: config.wsPort,
            public_host: config.publicHost,
            addresses: getLocalIPs()
        });
    });

    // [API] 라이브 설정 조회
    app.get("/api/live_config", (req, res) => {
        res.json({
            input_format: config.liveInputFormat,
            input_device: config.liveInputDevice
        });
    });

    // [API] 라이브 설정 저장
    app.post("/api/live_config", (req, res) => {
        if (req.body.input_device) config.liveInputDevice = req.body.input_device;
        res.json({ success: true });
    });
};

// 내부 유틸: IP 조회
function getLocalIPs() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const k in interfaces) {
        for (const k2 in interfaces[k]) {
            const address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    return addresses;
}
