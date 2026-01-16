# SPEC & ROADMAP (v0.3)
## ESP32-P4 + C6(C5) 오디오 단말 (LIVE + FILE PLAY + UI)

작성일: 2026-01-15  
작성자: (Owner)  
대상: FW 개발자 / PC 데모 서버 개발자 / 운영 서버 개발자

---

## 0. 목적
본 문서는 ESP32-P4 기반 단말에서 아래 기능을 단계적으로 개발/데모/운영으로 확장하기 위한 사양 및 로드맵을 정의한다.

### 기능 목표
1) LIVE (실시간 방송)
- 서버 → 단말로 실시간 음성 전송
- 단말: 수신 → 재생(I2S) (+선택: 동시 저장)

2) FILE PLAY (파일 전송 재생)
- 서버가 “이 파일을 재생하라” 지시
- 단말: 파일 다운로드(권장 Pull) → 재생(I2S) (+선택: 캐시 저장)

3) UI (7" MIPI + LVGL)
- 초기: 상태 텍스트 표시(대기/수신중/방송중/종료 + 파일다운로드/파일재생)
- 추후: 시나리오 확정 시 UI 확장(리스트/설정/업데이트 등)

---

## 1. 현재 확보된 기반(이미 완료)
- 7” MIPI LCD 구동
- Touch 구동
- LVGL 구동
- MP3 재생 및 I2S 출력
- AP/STA 연결 연습

결론: 디스플레이/터치/오디오아웃/네트워크 기반은 확보되었고,
남은 작업은 프로토콜/버퍼링/디코딩/저장/파일전송/상태머신을 결합하는 것.

---

## 2. 시스템 아키텍처(최종 목표)
### 2.1 하드웨어
- Main MCU: ESP32-P4 (오디오 디코드/재생/저장/시스템제어/UI)
- Network: ESP32-C6 또는 C5 (Wi-Fi)
- P4 ↔ C6: SDIO 우선, 고속 SPI fallback
- Audio Out: I2S + External DAC/AMP
- Storage: QSPI Flash 64MB, LittleFS
- Display: 7" MIPI DSI, Touch(I2C)

### 2.2 소프트웨어 구성 원칙(중요)
- 오디오/네트워크/UI는 서로 직접 함수 호출 금지
- 모든 연동은 "이벤트 큐(Queue)"로만 처리 (유지보수/확장/디버깅 목적)
- 상태머신(state machine)이 시스템 동작의 중심
- 장기적으로도 동일 구조 유지(데모 → 운영)

### 2.3 태스크/모듈(권장)
- control_task: WS/WSS 제어 채널 처리(JSON 수신/송신)
- live_rtp_rx_task: RTP/UDP 수신, 시퀀스/타임스탬프 계측
- jitterbuf_task: 지터버퍼(재정렬/드롭/지연 관리)
- opus_decode_task: Opus → PCM 디코드
- audio_out_task: PCM → I2S 출력 (기존 MP3 출력 파이프라인과 분리/재사용)
- file_dl_task: HTTP(S) 파일 다운로드(파일/스트림 다운로드)
- file_play_task: 파일 재생(초기 MP3 고정 권장)
- record_task: 저장(슬롯/캐시/동시저장)
- ui_task: LVGL UI 표시(초기: 텍스트 상태 표시)

---

## 3. 동작 모드 정의
### 3.1 Mode A: LIVE (실시간 방송)
- Control Plane: WS/WSS(JSON)
- Data Plane: RTP/UDP(+Opus)
- 단말: RTP 수신 → 지터버퍼 → Opus 디코드 → I2S 출력
- 선택: LIVE 수신 중 Flash 저장(슬롯)

### 3.2 Mode B: FILE PLAY (파일 전송 재생, 미리 녹음된 파일)
- Control Plane: WS/WSS(JSON)로 파일 재생 지시
- Data Plane(권장): 단말이 HTTP(S)로 파일을 "가져오는(Pull)" 방식
  - 서버는 URL 또는 file_id를 알려줌
  - 단말이 다운로드/재생/캐시/재시도를 책임
- 구현 단계:
  1) 다운로드 완료 후 재생 (쉬운 성공)
  2) 다운로드하면서 재생(스트리밍 다운로드) (고도화)

NOTE:
- “서버가 파일을 단말로 직접 전송(push streaming)”은 NAT/재전송/캐시/운영 난이도가 커지므로
  운영 안정성 관점에서 Pull 방식을 우선 권장한다.

---

## 4. UI 상태 정의(최소 버전)
UI는 초기에는 "상태 표시기"로만 운영한다.

- IDLE: 수신 대기중(네트워크 미연결)
- READY: 수신 대기중(네트워크/서버 연결됨)
- BUFFERING: 수신중(지터버퍼 채우는 중)
- PLAYING_LIVE: 방송중(LIVE 재생)
- DOWNLOADING: 파일 받는중(FILE 다운로드)
- PLAYING_FILE: 파일 재생중(FILE 재생)
- STOPPED: 종료(잠깐 표시 후 READY로 복귀)
- ERROR: 오류(네트워크/오디오/저장/파일)

UI 표기(초기 텍스트 권장):
- "수신 대기중"
- "수신중..."
- "방송중"
- "파일 받는중... (xx%)"
- "파일 재생중"
- "종료"
- "오류: 네트워크/오디오/저장/파일"

---

## 5. Control Protocol (WS/WSS + JSON)
### 5.1 공통 필드(권장)
- proto_ver: number (예: 1)
- device_id: string (MAC 또는 프로비저닝 ID)
- seq: number (메시지 시퀀스)
- session_id: string (세션 식별자; live/file 공통)

### 5.2 LIVE 제어
#### live_start
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

#### live_stop
{ "type":"live_stop", "proto_ver":1, "session_id":"live-001" }

### 5.3 FILE PLAY 제어 (권장: Pull Download)
#### file_play
{
  "type":"file_play",
  "proto_ver":1,
  "session_id":"file-001",
  "url":"http://192.168.0.10:8080/media/voice001.mp3",
  "codec":"mp3",
  "auto_play":true,
  "store_policy":"cache"
}

- store_policy:
  - "cache": 다운로드 후 Flash에 저장(캐시)하고 재생
  - "no-store": 저장하지 않고(또는 임시 파일) 재생만

#### file_stop
{ "type":"file_stop", "proto_ver":1, "session_id":"file-001" }

### 5.4 상태 보고(선택)
#### status_req
{ "type":"status_req", "proto_ver":1 }

#### status_report (예시)
{
  "type":"status_report",
  "proto_ver":1,
  "device_id":"P4-xxxx",
  "state":"PLAYING_FILE",
  "last_error":"none",
  "dl_bytes":123456,
  "dl_total":345678,
  "rtp_loss_pct":0.3,
  "jitter_ms":12,
  "free_heap":123456,
  "psram_free":12345678
}

---

## 6. LIVE Data Protocol (RTP/UDP + Opus)
### 6.1 코덱
- Opus, 16kHz, Mono, 24~32kbps
- frame_ms: 20ms 권장(초기 고정)

### 6.2 지터버퍼(초기 규칙)
- 초기 목표 지연: 120~200ms
- 시퀀스 기반 재정렬/늦은 패킷 드롭 정책 정의
- 패킷 누락 시 Opus PLC 활용(가능하면)

---

## 7. 저장/캐시(선택 기능)
### 7.1 파일 시스템
- LittleFS on QSPI Flash

### 7.2 슬롯 정책(선택)
- 슬롯 1~6 기본
- LIVE 저장: Ogg Opus 또는 frame+index
- FILE 캐시: 원본(mp3) 그대로 캐시 가능

### 7.3 전원 차단 안전(권장)
- 1~5초 단위 커밋/flush
- finalize(종료 마커)로 파일 완결성 판단
- 부팅 시 incomplete 파일 정리 정책

---

# 8. 개발 마일스톤(단계별)
## M0. 골격/이벤트버스/상태머신
목표: 오디오/네트워크 없이도 상태 전환 + UI 표시가 완성
- 산출물: app_event_queue, state_machine, ui_task(텍스트)
- 완료조건: 버튼/타이머로 상태 전환 시 UI 정확

## M1. Control(WS) 연결 + UI 연동
목표: PC 데모 서버에서 명령 보내면 상태/UI가 바뀜
- live_start/stop, file_play/stop 최소 파싱
- 완료조건: 명령 수신 → 이벤트 발행 → UI 상태 전환 OK

## M2. LIVE: RTP 수신 계측(디코드 없이)
목표: RTP 패킷 수신/유실/지터를 측정
- 완료조건: 1~2분 수신 통계 안정적으로 출력

## M3. LIVE: Opus 디코드 + I2S 출력
목표: LIVE 방송 재생 성공
- 완료조건: 5~10분 연속 재생(지터버퍼 튜닝 가능)

## M4. LIVE 동시 저장(슬롯)(선택)
목표: 방송중 저장 + 종료 후 파일 유지
- 완료조건: 슬롯 저장이 깨지지 않음(재부팅 포함)

## M5. FILE PLAY (파일 전송 재생) — 핵심
### M5-1: 다운로드 완료 후 재생(쉬운 성공)
- file_play(url) → HTTP GET → LittleFS 저장(또는 임시) → MP3 재생
- file_stop: 다운로드/재생 중단
- 완료조건: LAN에서 3회 이상 반복 성공 + 실패 시 ERROR/복귀

### M5-2: 다운로드하면서 재생(고도화)
- HTTP chunk/Range + 링버퍼(PSRAM) → 디코더에 공급
- underflow/overflow 정책
- 완료조건: 체감 대기시간 감소 + 재생 안정

## M6. UI 확장(시나리오 확정 후)
- 파일 목록/설정/볼륨/네트워크/업데이트 등

---

# 9. 로그/계측(초기부터 권장)
- 상태 전이 로그: old->new + reason
- LIVE 통계: loss%, jitter_ms, reorder_count, late_drop_count
- 버퍼: jitterbuf_level_ms, pcm_queue_ms
- FILE: dl_bytes/dl_total, speed, retry_count
- 메모리: free_heap, psram_free
- 저장: fs_error_count, write_backlog

---

# 10. 문서 운영(레포 권장 구조)
- SPEC_ROADMAP.md (본 문서)
- PC_DEMO_SERVER.md (PC 담당자용)
- PROTOCOL.md (메시지/필드/예시만)
- CODEX_PROMPTS.md (단계별 Codex 지시서)

버전 업데이트:
- v0.x: 데모/기능 확정 전
- v1.0: 운영 프로토콜/정책 확정
