"use strict";

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const DEFAULT_FRAME_MS = 20;
const DEFAULT_SAMPLE_RATE = 16000;

// 실행 중인 파이썬 프로세스들을 관리하는 Map
// Key: deviceId, Value: { type: "python", proc: Process }
const liveSenders = new Map();

// [기능 1] 파이썬 스크립트 실행 (Live Start)
function startLiveStream(key, rtpIp, rtpPort, frameMs, config, volume) {
  if (liveSenders.has(key)) {
    console.log(`[Live] Sender already running for ${key}`);
    return;
  }

  const isPkg = !!process.pkg;
  const baseDir = isPkg ? path.dirname(process.execPath) : __dirname;
  const exeName = process.platform === "win32" ? "mic_sender.exe" : "mic_sender";
  const defaultExePath = path.join(baseDir, exeName);
  const configuredExePath = config.micSenderBin ? path.resolve(config.micSenderBin) : "";
  const exePath = configuredExePath && fs.existsSync(configuredExePath)
    ? configuredExePath
    : (fs.existsSync(defaultExePath) ? defaultExePath : "");
  const pythonScript = path.join(__dirname, "mic_sender.py");
  
  // 파이썬에 전달할 인자: IP, Port, Device ID (아까 찾은 마이크 번호, config에서 가져옴)
  // config.liveInputDevice에 마이크 번호 숫자(예: "1")가 들어있다고 가정합니다.
  const micDeviceIndex = config.liveInputDevice || "1"; 

  const volumeValue = Number.isFinite(Number(volume)) ? String(volume) : "2.0";
  const baseArgs = [
    "--ip", rtpIp,
    "--port", String(rtpPort),
    "--device", micDeviceIndex,
    "--volume", volumeValue
  ];

  let execCmd;
  let execArgs;
  if (exePath) {
    execCmd = exePath;
    execArgs = baseArgs;
  } else {
    execCmd = process.platform === "win32" ? "python" : "python3";
    execArgs = [pythonScript, ...baseArgs];
  }

  console.log(`[Live] Spawning: ${execCmd} ${execArgs.join(" ")}`);

  const proc = spawn(execCmd, execArgs, { cwd: baseDir, stdio: ["ignore", "pipe", "pipe"] });

  proc.stdout.on("data", (data) => {
    // 파이썬 정상 로그는 너무 많을 수 있으니 필요하면 주석 해제
    // console.log(`[Py-${key}] ${data.toString().trim()}`);
  });

  proc.stderr.on("data", (data) => {
    console.log(`[Py-Err-${key}] ${data.toString().trim()}`);
  });

  proc.on("exit", (code) => {
    console.log(`[Live] Process exited for ${key} (code=${code})`);
    liveSenders.delete(key);
  });

  liveSenders.set(key, { type: "python", proc });
}

// [기능 1-2] 파이썬 스크립트 종료 (Live Stop)
function stopLiveSender(key) {
  // "all"이면 모든 프로세스 종료
  if (key === "all") {
    for (const [k, sender] of Array.from(liveSenders.entries())) {
      killProcess(sender);
      liveSenders.delete(k);
    }
    return;
  }

  const sender = liveSenders.get(key);
  if (sender) {
    killProcess(sender);
    liveSenders.delete(key);
  }
}

function killProcess(sender) {
  if (sender.proc) {
    sender.proc.kill("SIGINT"); // 부드러운 종료 시도
    setTimeout(() => {
      if (!sender.proc.killed) sender.proc.kill(); // 강제 종료
    }, 1000);
  }
}

function getLiveStatus(target) {
  const entries = target === "all"
      ? Array.from(liveSenders.entries())
      : liveSenders.has(target) ? [[target, liveSenders.get(target)]] : [];
  return { running: entries.length > 0 };
}

function initRtpDebug() { /* 디버그용 (필요 없으면 비워둠) */ }

module.exports = {
  DEFAULT_FRAME_MS,
  DEFAULT_SAMPLE_RATE,
  initRtpDebug,
  startLiveStream,
  stopLiveSender,
  getLiveStatus,
};
