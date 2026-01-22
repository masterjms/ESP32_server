"use strict";

const dgram = require("dgram");
const { spawn } = require("child_process");
const path = require("path"); // [필수] 경로 합칠 때 필요함

const RTP_PT_OPUS = 97;
const RTP_SSRC = 0x12345678;
const DEFAULT_FRAME_MS = 20;
const DEFAULT_SAMPLE_RATE = 16000;
const DUMMY_PAYLOAD_SIZE = 40;

let debugSocket = null;

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

// [수정됨] FFmpeg sender: 이제 직접 FFmpeg를 켜지 않고 파이썬 스크립트를 실행합니다.
function startFfmpegSender(key, rtpIp, rtpPort, frameMs, config) {
  if (liveSenders.has(key)) {
    console.log(`[RTP] sender already running for ${key}`);
    return;
  }

  // 파이썬 스크립트 경로 (live.js와 같은 폴더에 mic_sender.py가 있어야 함)
  const pythonScript = path.join(__dirname, "mic_sender.py");
  
  // 파이썬 실행 명령: python mic_sender.py --ip <IP> --port <PORT>
  // (FFmpeg 옵션은 이제 mic_sender.py 안에 다 들어있으므로 JS에선 신경 끌 것!)
  const args = [pythonScript, "--ip", rtpIp, "--port", String(rtpPort)];
  
  // 윈도우에서는 'python', 맥/리눅스에선 'python3'
  const pythonBin = process.platform === "win32" ? "python" : "python3";

  console.log(`[JS] Spawning Python: ${pythonBin} ${args.join(" ")}`);

  // 파이썬 프로세스 생성
  const proc = spawn(pythonBin, args, { stdio: ["ignore", "pipe", "pipe"] });

  // 파이썬의 print() 출력 로그 받기
  proc.stdout.on("data", (data) => {
    console.log(`[Python] ${data.toString().trim()}`);
  });

  // 파이썬이나 FFmpeg의 에러 로그 받기
  proc.stderr.on("data", (data) => {
    console.log(`[Python ERR] ${data.toString().trim()}`);
  });

  proc.on("exit", (code) => {
    console.log(`[JS] Python script exited with code ${code}`);
    liveSenders.delete(key);
  });

  // 프로세스 정보를 저장 (type: python_bridge)
  liveSenders.set(key, { type: "python_bridge", proc });
}

// Entry point for LIVE stream start.
function startLiveStream(key, rtpIp, rtpPort, frameMs, config) {
  if (config.liveMode === "dummy") {
    startDummySender(key, rtpIp, rtpPort, frameMs);
    return;
  }
  startFfmpegSender(key, rtpIp, rtpPort, frameMs, config);
}

function initRtpDebug(config) {
  if (!config.rtpDebug || debugSocket) {
    return;
  }
  debugSocket = dgram.createSocket("udp4");
  debugSocket.on("message", (msg) => {
    if (msg.length < 2) return;
    const payloadType = msg[1] & 0x7f;
    console.log(`[RTP-DEBUG] pt=${payloadType} len=${msg.length}`);
  });
  debugSocket.bind(config.rtpDebugPort, () => {
    console.log(`[RTP-DEBUG] listening on udp:${config.rtpDebugPort}`);
  });
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
        killSender(sender);
        liveSenders.delete(k);
    }
    return;
  }
  
  const sender = liveSenders.get(key);
  if (sender) {
    killSender(sender);
    liveSenders.delete(key);
  }
}

// 헬퍼 함수: 프로세스 종료 로직
function killSender(sender) {
  if (sender.type === "dummy") {
    clearInterval(sender.interval);
    sender.socket.close();
  } else if (sender.type === "ffmpeg" || sender.type === "python_bridge") {
    // 파이썬 프로세스를 죽임 (SIGINT가 깔끔함)
    sender.proc.kill("SIGINT"); 
    // 안 죽으면 1초 뒤 강제 종료
    setTimeout(() => {
        if (!sender.proc.killed) sender.proc.kill();
    }, 1000);
  }
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
  initRtpDebug,
  startLiveStream,
  stopLiveSender,
  getLiveStatus,
};

// "use strict";

// const dgram = require("dgram");
// const { spawn } = require("child_process");

// const RTP_PT_OPUS = 111;
// const RTP_SSRC = 0x12345678;
// const DEFAULT_FRAME_MS = 20;
// const DEFAULT_SAMPLE_RATE = 16000;
// const DUMMY_PAYLOAD_SIZE = 40;
// const LIVE_BITRATE = "32000";

// let debugSocket = null;

// // Active LIVE senders keyed by target id.
// const liveSenders = new Map();

// // Build minimal RTP header + payload (Opus PT=111).
// function buildRtpPacket(seq, timestamp, payload) {
//   const header = Buffer.alloc(12);
//   header[0] = 0x80;
//   header[1] = RTP_PT_OPUS & 0x7f;
//   header.writeUInt16BE(seq & 0xffff, 2);
//   header.writeUInt32BE(timestamp >>> 0, 4);
//   header.writeUInt32BE(RTP_SSRC >>> 0, 8);
//   return Buffer.concat([header, payload]);
// }

// // Dummy sender for debug-only RTP flow.
// function startDummySender(key, rtpIp, rtpPort, frameMs) {
//   if (liveSenders.has(key)) {
//     console.log(`[RTP] sender already running for ${key}`);
//     return;
//   }

//   const socket = dgram.createSocket("udp4");
//   let seq = 1;
//   let timestamp = 0;
//   const frameSamples = Math.round((DEFAULT_SAMPLE_RATE * frameMs) / 1000);
//   const payload = Buffer.alloc(DUMMY_PAYLOAD_SIZE, 0x00);

//   const interval = setInterval(() => {
//     const packet = buildRtpPacket(seq, timestamp, payload);
//     socket.send(packet, rtpPort, rtpIp);
//     seq = (seq + 1) & 0xffff;
//     timestamp = (timestamp + frameSamples) >>> 0;
//   }, frameMs);

//   liveSenders.set(key, { type: "dummy", socket, interval });
//   console.log(`[RTP] sending dummy opus to ${rtpIp}:${rtpPort} (${frameMs}ms)`);
// }

// // FFmpeg sender: mic -> Opus -> RTP.
// function startFfmpegSender(key, rtpIp, rtpPort, frameMs, config) {
//   if (!config.liveInputDevice) {
//     console.log("[RTP] LIVE_INPUT_DEVICE is required for ffmpeg mode");
//     return;
//   }
//   if (liveSenders.has(key)) {
//     console.log(`[RTP] sender already running for ${key}`);
//     return;
//   }

//   const inputDevice = normalizeInputDevice(config.liveInputDevice);
//   const inputArgs = ["-f", config.liveInputFormat, "-i", inputDevice];
//   const args = [
//   "-hide_banner",
//     "-loglevel", "info",

//     // [2] 입력 설정 (여기가 'JOAT' 해결의 열쇠)
//     "-f", "dshow",
//     "-audio_buffer_size", "80",  // 윈도우 버퍼링 방지
//     // 주의: 윈도우 제어판 마이크 설정이 48000Hz라면 48000, 44100Hz라면 44100을 써야 함.
//     // 모르겠으면 0으로 두면 FFmpeg가 알아서 감지함.
//     "-sample_rate", "0", 
//     "-i", inputDevice,

//     // [3] 필터: 리샘플링 (48k/44.1k -> 16k 변환) & 패킷 규격화
//     // aresample=16000: 여기서 깨끗하게 16000으로 변환됨
//     // asetnsamples=320: ESP32를 위해 20ms 단위로 자름
//     "-af", "aresample=16000,asetnsamples=320",

//     // [4] 코덱 및 전송
//     "-ac", "1",
//     "-c:a", "libopus",
//     "-b:a", "24k",
//     "-vbr", "off",
//     "-frame_duration", "20",
//     "-application", "lowdelay",
    
//     "-f", "rtp",
//     "-payload_type", "111",
//     "-ssrc", "305419896",
    
//     `rtp://${rtpIp}:${rtpPort}`,
//   ];

//   console.log(`[FFMPEG] cmd: ${config.ffmpegBin} ${args.join(" ")}`);

//   const proc = spawn(config.ffmpegBin, args, { stdio: ["ignore", "ignore", "pipe"] });
//   proc.on("error", (err) => {
//     console.log(`[FFMPEG] spawn error for ${key}: ${err.message}`);
//     liveSenders.delete(key);
//   });
//   proc.stderr.on("data", (buf) => {
//     const text = buf.toString().trim();
//     if (text) {
//       console.log(`[FFMPEG] ${text}`);
//     }
//   });
//   proc.on("exit", (code, signal) => {
//     console.log(`[FFMPEG] exited for ${key} (code=${code}, signal=${signal})`);
//     liveSenders.delete(key);
//   });

//   liveSenders.set(key, { type: "ffmpeg", proc });
//   console.log(`[RTP] sending opus via ffmpeg to ${rtpIp}:${rtpPort} (${frameMs}ms)`);
// }

// // Entry point for LIVE stream start.
// function startLiveStream(key, rtpIp, rtpPort, frameMs, config) {
//   if (config.liveMode === "dummy") {
//     startDummySender(key, rtpIp, rtpPort, frameMs);
//     return;
//   }
//   startFfmpegSender(key, rtpIp, rtpPort, frameMs, config);
// }

// function initRtpDebug(config) {
//   if (!config.rtpDebug || debugSocket) {
//     return;
//   }
//   debugSocket = dgram.createSocket("udp4");
//   debugSocket.on("message", (msg) => {
//     if (msg.length < 2) return;
//     const payloadType = msg[1] & 0x7f;
//     console.log(`[RTP-DEBUG] pt=${payloadType} len=${msg.length}`);
//   });
//   debugSocket.bind(config.rtpDebugPort, () => {
//     console.log(`[RTP-DEBUG] listening on udp:${config.rtpDebugPort}`);
//   });
// }

// function normalizeInputDevice(input) {
//   const trimmed = input.trim();
//   const match = trimmed.match(/^audio=\"(.+)\"$/);
//   if (match) {
//     return `audio=${match[1]}`;
//   }
//   return trimmed;
// }

// // Stop one or all LIVE senders.
// function stopLiveSender(key) {
//   if (key === "all") {
//     for (const [k, sender] of Array.from(liveSenders.entries())) {
//       if (sender.type === "dummy") {
//         clearInterval(sender.interval);
//         sender.socket.close();
//       } else if (sender.type === "ffmpeg") {
//         sender.proc.kill("SIGINT");
//       }
//       liveSenders.delete(k);
//       console.log(`[RTP] stopped sender for ${k}`);
//     }
//     return;
//   }
//   const sender = liveSenders.get(key);
//   if (!sender) {
//     if (liveSenders.size > 0) {
//       console.log(`[RTP] sender not found for ${key}, stopping all`);
//       stopLiveSender("all");
//       return;
//     }
//     console.log(`[RTP] sender not found for ${key}`);
//     return;
//   }
//   if (sender.type === "dummy") {
//     clearInterval(sender.interval);
//     sender.socket.close();
//   } else if (sender.type === "ffmpeg") {
//     sender.proc.kill("SIGINT");
//   }
//   liveSenders.delete(key);
//   console.log(`[RTP] stopped sender for ${key}`);
// }

// // Aggregate LIVE status for UI polling.
// function getLiveStatus(target) {
//   const entries =
//     target === "all"
//       ? Array.from(liveSenders.entries())
//       : liveSenders.has(target)
//       ? [[target, liveSenders.get(target)]]
//       : [];
//   return { running: entries.length > 0 };
// }

// module.exports = {
//   DEFAULT_FRAME_MS,
//   DEFAULT_SAMPLE_RATE,
//   initRtpDebug,
//   startLiveStream,
//   stopLiveSender,
//   getLiveStatus,
// };
