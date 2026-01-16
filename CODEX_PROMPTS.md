# Codex Prompts (v0.2)
## 목적
VS Code에서 Codex와 단계별로 대화하며 기능을 구현할 때,
"작업지시서"로 바로 붙여넣어 사용한다.

---

## 공통 규칙(항상 함께 전달)
- 태스크 간 직접 호출 금지, Queue 이벤트로만 연결
- 기존 LCD/LVGL/MP3/I2S 초기화 코드는 최대한 유지하고 연결만
- 컴파일 에러 0 (ESP-IDF 기준)
- 로그는 ESP_LOGI/ESP_LOGE로 통일
- PSRAM 사용량/heap/free 로그를 주요 포인트에 추가

---

## M0: 골격/이벤트버스/상태머신
```text
ESP-IDF 프로젝트에 상태머신 + 이벤트 큐 기반 골격을 추가해줘.
- app_event_queue: FreeRTOS Queue로 이벤트 구조체 송수신
- state_machine: IDLE/READY/BUFFERING/PLAYING_LIVE/DOWNLOADING/PLAYING_FILE/STOPPED/ERROR 상태 전이
- ui_task: 상태가 바뀌면 LVGL 텍스트만 갱신(최소 문구)
기존 LCD/LVGL 초기화 코드는 유지하고, 새 파일은 최소로 추가해줘.
