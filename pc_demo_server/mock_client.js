"use strict";

const WebSocket = require("ws");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// 서버 주소 (로컬 테스트용)
const WS_URL = "ws://127.0.0.1:9001";
const MY_IP = "127.0.0.1"; // 로컬 루프백

console.log(`[Mock] Connecting to ${WS_URL}...`);
const ws = new WebSocket(WS_URL);

let playerProcess = null;

ws.on("open", () => {
    console.log("[Mock] WebSocket Connected!");
    // 서버에 연결되면 자동으로 device-N으로 등록됨
});

ws.on("message", (data) => {
    const msg = JSON.parse(data);
    console.log("[Mock] Received:", msg);

    // 1. 서버가 "너 아이디는 이거야" 라고 알려줄 때
    if (msg.type === "hello") {
        console.log(`[Mock] Registered as: ${msg.device_id}`);
    }

    // 2. 라이브 시작 명령 (live_start)
    else if (msg.type === "live_start") {
        const port = msg.rtp_port;
        console.log(`[Mock] Starting Player on port ${port}...`);
        startPlayer(port);
    }

    // 3. 라이브 중지 명령 (live_stop)
    else if (msg.type === "live_stop") {
        console.log("[Mock] Stopping Player...");
        stopPlayer();
    }
});

ws.on("close", () => {
    console.log("[Mock] Disconnected from server");
    stopPlayer();
});

ws.on("error", (err) => {
    console.error("[Mock] Error:", err.message);
});

// --- FFplay(플레이어) 제어 함수 ---

function startPlayer(port) {
    if (playerProcess) stopPlayer();

    // 1. SDP 파일 생성 (ffplay가 RTP를 이해하기 위한 명세서)
    const sdpContent = `v=0
o=- 0 0 IN IP4 ${MY_IP}
s=No Name
c=IN IP4 ${MY_IP}
t=0 0
a=tool:libavformat
m=audio ${port} RTP/AVP 111
b=AS:24
a=rtpmap:111 opus/48000/2`;

    const sdpPath = path.join(__dirname, "mock.sdp");
    fs.writeFileSync(sdpPath, sdpContent);

    // 2. ffplay 실행 (지연 시간 최소화 옵션 적용)
    // -nodisp: 화면 없음, -autoexit: 끝나면 종료, -protocol_whitelist: 보안 경고 무시
    const args = [
        "-protocol_whitelist", "file,udp,rtp",
        "-nodisp", 
        "-fflags", "nobuffer", 
        "-flags", "low_delay",
        "-i", sdpPath
    ];

    console.log(`[Player] Spawning ffplay...`);
    
    // 윈도우에서는 ffplay가 ffmpeg 설치할 때 같이 깔려있음
    playerProcess = spawn("ffplay", args, { stdio: "inherit" });

    playerProcess.on("exit", (code) => {
        console.log(`[Player] Exited with code ${code}`);
        playerProcess = null;
    });
}

function stopPlayer() {
    if (playerProcess) {
        playerProcess.kill();
        playerProcess = null;
    }
}