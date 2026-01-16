# PC Demo Server

ESP32-P4/C6 데모용 PC 서버. WebSocket으로 명령을 push하고, HTTP로 MP3 파일을 제공한다.

## 서버 UI 설명
- Server Info: 현재 서버 접속 주소(HTTP/WS)와 ESP32 입력용 WS URL 표시
- Clients: `/api/clients`를 호출해 접속 중 단말 리스트 확인
- File Play: `file_play`, `file_stop`, `status_req` 버튼 제공
- LIVE: 더미 RTP 송출을 `live_start/live_stop` 버튼으로 제어

## 구현된 부분
- WS 제어 서버: 단말 접속/명령 push
- HTTP 파일 서버: `/media` 정적 파일 제공
- 웹 UI: 단말 목록/명령 전송 버튼 제공
- 터미널 CLI: `file_play`, `file_stop`, `live_start`, `live_stop`, `status_req`
- `/api/clients`: 현재 접속 중인 단말 목록 JSON 반환
- 더미 RTP/UDP 송출: `live_start` 시 20ms 주기로 RTP 패킷 송출
- HTTP 다운로드 로그: `/media` 요청이 들어오면 콘솔에 출력

## 미구현/제약(데모 한정)
- 실제 Opus 프레임 송출(현재는 더미 payload)
- 다중 단말 동시 LIVE 송출 자동 분기
- 인증/토큰/보안(WSS, ACL 등)
- 상태 보고 수집/저장(로그 출력만)

## 빠른 시작
```bash
cd pc_demo_server
npm install
node server.js
```

## 서버 UI 들어가는 방법
1) 서버 실행: `node server.js`
2) 브라우저 접속:
   - 로컬: `http://localhost:8080/`
   - LAN: `http://PC_IP:8080/`
3) 상단에 표시된 `ESP32 입력값`을 단말 설정에 사용

## 포트포워딩 설정 방법(원격 접속 시)
1) 공유기 관리자 페이지 접속 (예: `http://192.168.0.1`)
2) 포트포워딩/NAT/가상서버 메뉴 진입
3) 규칙 추가
   - TCP 8080 -> PC_IP:8080 (HTTP)
   - TCP 9001 -> PC_IP:9001 (WS)
4) (선택) LIVE 외부 테스트 시 UDP 4000도 포워딩
5) PC IP는 고정 IP 또는 DHCP 예약 권장

## LIVE 테스트 방법(더미 RTP)
### 1) 브라우저 UI로 테스트
1) `RTP Target IP`에 테스트 수신 주소 입력
   - 로컬 테스트: `127.0.0.1`
2) `RTP Target Port`에 `4000` 입력
3) `live_start` 클릭
4) 서버 콘솔에 아래 로그 확인
```
[RTP] sending dummy opus to 127.0.0.1:4000 (20ms)
```
5) `live_stop` 클릭 후 송출 중단 로그 확인

### 2) 터미널에서 수신 확인(로컬)
```bash
node -e "const d=require('dgram');const s=d.createSocket('udp4');s.on('message',(m)=>console.log('len',m.length,'head',m.slice(0,12).toString('hex')));s.bind(4000,()=>console.log('udp listen 4000'));"
```
- `live_start` 이후 `len ... head ...` 로그가 계속 나오면 송출 성공

## 터미널 CLI 사용 방법
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
