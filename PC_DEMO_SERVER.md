# PC 데모 서버 가이드 (v0.2)
## 목적
ESP32 단말을 "같은 네트워크(LAN)"에서 빠르게 데모하기 위한 PC(노트북) 서버 구성 가이드.
PC 담당자는 이 문서를 기준으로 데모 서버를 구현한다.

### 제공 기능(필수)
1) Control Plane: WebSocket 서버
- ESP32 단말(클라이언트)이 접속
- PC에서 단말로 JSON 명령 Push

2) File Plane: HTTP 서버
- /media/ 아래 MP3 파일 호스팅
- ESP32가 HTTP GET으로 다운로드

### 제공 기능(선택/추후)
3) LIVE Plane: RTP/UDP Opus 송출
- LIVE 데모까지 진행 시 추가

---

## 1. 네트워크 전제
- PC와 ESP32가 동일 공유기(같은 서브넷) 연결
- PC의 IP 확인 (예: 192.168.0.10)
- 방화벽에서 포트 허용:
  - HTTP: 8080 (권장)
  - WS: 9001 (권장)

---

## 2. 기능 요구사항 상세
## 2.1 WebSocket(Control) 서버
### 역할
- ESP32 단말이 WS로 연결(1~N대)
- PC 운영자가 특정 단말(또는 전체)에 명령 전송

### 최소 명령
#### file_play
목적: 지정 URL의 음원 파일을 단말이 다운로드 후 재생
예시:
{
  "type":"file_play",
  "proto_ver":1,
  "session_id":"file-001",
  "url":"http://{PC_IP}:8080/media/voice001.mp3",
  "codec":"mp3",
  "auto_play":true,
  "store_policy":"cache"
}

#### file_stop
목적: 다운로드/재생 중단
{
  "type":"file_stop",
  "proto_ver":1,
  "session_id":"file-001"
}

#### live_start/live_stop (선택)
LIVE 데모 진행 시 사용(추후)

#### status_req (선택)
단말 상태 수집(디버깅 편의)

---

## 2.2 HTTP(File) 서버
### 역할
- 정적 파일 호스팅
- URL 예:
  http://{PC_IP}:8080/media/voice001.mp3

### 요구사항
- Content-Length 제공(가능하면) → 단말 진행률 계산에 유리
- Range 지원(가능하면) → M5-2(다운로드하며 재생), 재개 다운로드에 유리

---

## 3. 데모 절차(권장)
1) PC에서 HTTP 서버 실행 (8080)
2) PC에서 WS 서버 실행 (9001)
3) ESP32 부팅 → WS 서버 접속
4) PC에서 file_play 명령 전송
5) ESP32 다운로드 → 재생 성공 확인
6) file_stop 동작 확인

---

## 4. 테스트 체크리스트
- [ ] WS 연결 유지, 끊김 시 ESP 재접속 허용
- [ ] file_play URL 200 OK일 때 정상 재생
- [ ] 404/500 등 오류 시 단말 ERROR 처리 유도
- [ ] file_stop (다운로드 중단/재생 중지)
- [ ] 동일 파일 3회 연속 재생 안정성
- [ ] 10MB 이상 파일 다운로드 안정성

---

## 5. 운영 서버로 확장 시 고려(참고)
- WS → WSS(TLS)
- 인증 토큰/디바이스 등록
- 파일 식별자(file_id) + checksum 제공
- 동시 접속 수/관리 UI(웹페이지) 제공
