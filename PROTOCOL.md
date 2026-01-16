# Protocol Spec (v0.2)
## ESP32-P4 오디오 단말 제어 프로토콜

---

## 1. 공통 규칙
- Transport: WebSocket (데모는 WS, 운영은 WSS 권장)
- Encoding: JSON UTF-8
- 단말은 수신한 명령에 따라 상태머신 이벤트를 발생시킨다.
- (선택) 단말은 status_report로 상태/통계를 보고한다.

---

## 2. 공통 필드(권장)
- proto_ver: number
- device_id: string (단말 ID, 예: MAC 기반)
- seq: number (요청/응답 매칭용)
- session_id: string (동작 세션 식별자)

---

## 3. 메시지 정의
## 3.1 file_play
### 설명
서버가 특정 음원 파일을 재생하도록 지시한다.
단말은 URL을 통해 파일을 다운로드(Pull) 후 재생한다.

### 필드
- url: string (http/https)
- codec: "mp3" (초기 고정 권장)
- auto_play: boolean (true면 다운로드 후 즉시 재생)
- store_policy: "cache" | "no-store"
  - cache: LittleFS에 저장 후 재생(또는 저장+재생)
  - no-store: 저장 최소화(임시 파일/스트리밍 재생 단계에서 활용)

### 예시
{
  "type":"file_play",
  "proto_ver":1,
  "session_id":"file-001",
  "url":"http://192.168.0.10:8080/media/voice001.mp3",
  "codec":"mp3",
  "auto_play":true,
  "store_policy":"cache"
}

---

## 3.2 file_stop
### 설명
파일 다운로드/재생을 중단한다.

### 예시
{ "type":"file_stop", "proto_ver":1, "session_id":"file-001" }

---

## 3.3 live_start (선택)
### 설명
LIVE 방송을 시작한다.

### 예시
{
  "type":"live_start",
  "proto_ver":1,
  "session_id":"live-001",
  "rtp_ip":"192.168.0.10",
  "rtp_port":4000,
  "codec":"opus",
  "frame_ms":20,
  "sample_rate":16000
}

---

## 3.4 live_stop (선택)
{ "type":"live_stop", "proto_ver":1, "session_id":"live-001" }

---

## 3.5 status_req / status_report (선택)
### status_req
{ "type":"status_req", "proto_ver":1 }

### status_report (예시)
{
  "type":"status_report",
  "proto_ver":1,
  "device_id":"P4-xxxx",
  "state":"DOWNLOADING",
  "dl_bytes":123456,
  "dl_total":345678,
  "rtp_loss_pct":0.0,
  "jitter_ms":0,
  "last_error":"none"
}
