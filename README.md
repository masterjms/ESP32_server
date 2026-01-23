# Audio Server Controller (PC Demo Server)

ESP32 단말을 LAN에서 제어/테스트하기 위한 PC 데모 서버.  
WS(Control) + HTTP(File) + LIVE RTP 송출(마이크 → Opus → RTP)을 제공한다.

## 주요 기능
- WS 제어 서버 (단말 접속/명령 push)
- HTTP 파일 서버 (`/media`)
- 웹 UI (단말 선택, file_play, live_start/stop, 마이크 선택, 볼륨 조절)
- LIVE RTP 송출: `mic_sender.exe` 기반 Opus RTP
- Windows exe 배포 및 설치 프로그램(Inno Setup)

## 폴더 구조 (개발)
```
audio_server/
├─ pc_demo_server/
│  ├─ server.js
│  ├─ routes.js
│  ├─ live.js
│  ├─ mic_sender.py
│  ├─ public/
│  └─ media/
├─ AudioServer.iss
```

## 빠른 시작 (소스 실행)
```bash
cd pc_demo_server
npm install
node server.js
```
브라우저: `http://localhost:8080`

## API 개요 (UI 내부에서 사용)
- `GET /api/devices` : 접속 단말 리스트
- `POST /api/file_play` : file_play 전송
- `POST /api/file_stop` : file_stop 전송
- `POST /api/live_start` : live_start 전송 + mic_sender 실행
- `POST /api/live_stop` : live_stop 전송 + mic_sender 종료
- `POST /api/disconnect` : 단말 연결 강제 종료
- `GET /api/audio_devices` : 마이크 목록

## LIVE 송출 개요
- 서버는 `mic_sender.exe`(또는 `mic_sender.py`)를 실행해 RTP 송출
- 기본 RTP 포트: 4000
- 볼륨: UI 슬라이더 값 → `--volume` 인자로 전달

## 배포 폴더 구조 (예: AudioServer_v1.0)
아래 구조로 **모든 파일을 동일 루트**에 배치:
```
AudioServer_v1.0/
├─ server.exe
├─ mic_sender.exe
├─ ffmpeg.exe
├─ public/
└─ media/
```

## Windows 빌드 & 배포
### 1) 빌드/패키징 스크립트
PowerShell에서 실행:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
cd pc_demo_server
.\build_release.ps1 -Version "v1.0" -FfmpegPath "C:\path\to\ffmpeg.exe"
```
출력 폴더: `..\AudioServer_v1.0` (pc_demo_server 상위)

### 2) server.exe 수동 빌드 (pkg)
```powershell
cd pc_demo_server
npx pkg server.js --targets node18-win-x64 --output server.exe --assets "public/**/*" --assets "media/**/*"
```

### 3) mic_sender.exe 수동 빌드 (PyInstaller)
```powershell
cd pc_demo_server
py -m pip install pyinstaller
py -m PyInstaller mic_sender.spec
```

## 설치 프로그램(Inno Setup)
루트의 `AudioServer.iss` 사용:
1) `AudioServer_v1.0` 폴더의 파일들이 최신인지 확인  
2) Inno Setup에서 `.iss` 열고 컴파일  
3) 생성된 `Setup.exe` 배포

## 환경변수
- `HTTP_PORT` / `WS_PORT` / `HOST`
- `PUBLIC_HOST`
- `FFMPEG_BIN` (ffmpeg.exe 직접 지정)
- `MIC_SENDER_BIN` (mic_sender.exe 직접 지정)
- `LIVE_INPUT_DEVICE` (마이크 ID)

## 동작 팁
- `server.exe`는 실행 직후 브라우저를 자동으로 열도록 설정됨.
- 서버는 exe 실행 경로 기준으로 `public/` 및 `media/`를 찾는다.

