# PC Demo Server

ESP32-P4/C6 데모용 PC 서버. WebSocket으로 명령을 push하고, HTTP로 MP3 파일을 제공한다.

## 제공 기능(구현됨)
- WS 제어 서버: 단말 접속/명령 push
- HTTP 파일 서버: `/media` 정적 파일 제공
- 터미널 CLI: `file_play`, `file_stop`, `live_start`, `live_stop`, `status_req`
- `/api/clients`: 현재 접속 중인 단말 목록 JSON 반환
- 더미 RTP/UDP 송출: `live_start` 시 20ms 주기로 RTP 패킷 송출

## 미구현/제약(데모 한정)
- 실제 Opus 프레임 송출(현재는 더미 payload)
- 다중 단말 동시 LIVE 송출 자동 분기
- 인증/토큰/보안(WSS, ACL 등)
- 웹 UI(현재는 안내 페이지 수준)
- 상태 보고 수집/저장(로그 출력만)

## 빠른 시작
```bash
cd pc_demo_server
npm install
node server.js
```

## 사용 방법(터미널 CLI)
```text
demo> list
demo> file_play DEVICE001 http://PC_IP:8080/media/voice001.mp3
demo> file_stop DEVICE001
demo> live_start DEVICE001 192.168.0.10 4000
demo> live_stop DEVICE001
demo> status_req DEVICE001
```

## 단말 접속 예시
```
ws://PC_IP:9001/?device_id=DEVICE001
```

## HTTP 파일 경로
```
http://PC_IP:8080/media/voice001.mp3
```
