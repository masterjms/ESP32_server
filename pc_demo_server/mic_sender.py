import argparse
import sys
import subprocess
import sounddevice as sd
import numpy as np
import json

# ESP32 설정 (16k 모노)
SAMPLE_RATE = 16000
CHANNELS = 1
FRAME_MS = 20
BLOCK_SIZE = int(SAMPLE_RATE * FRAME_MS / 1000)

def list_devices():
    """시스템 오디오 장치 목록을 JSON으로 반환"""
    devices = sd.query_devices()
    input_devices = []
    for i, dev in enumerate(devices):
        # 입력 채널이 있는 장치만 필터링
        if dev['max_input_channels'] > 0:
            input_devices.append({
                "index": i,
                "name": dev['name']
            })
    return json.dumps(input_devices)

def main():
    parser = argparse.ArgumentParser()
    
    # [수정 1] --list_devices 옵션 추가
    parser.add_argument('--list_devices', action='store_true', help='List input devices in JSON')
    
    # [수정 2] --ip를 필수(required=True)에서 선택(False)으로 변경
    parser.add_argument('--ip', required=False, help='Target ESP32 IP')
    
    parser.add_argument('--port', type=int, default=4000, help='Target RTP Port')
    parser.add_argument('--device', type=str, default=None, help='Input Device ID or Name')
    parser.add_argument('--volume', type=float, default=2.0, help='Volume multiplier (e.g., 1.0)')
    
    args = parser.parse_args()

    # [수정 3] 목록 조회 모드면 IP 체크 없이 바로 출력하고 종료
    if args.list_devices:
        try:
            print(list_devices())
            sys.stdout.flush()
            sys.exit(0)
        except Exception as e:
            # JSON 포맷 에러 방지용
            print(json.dumps({"error": str(e)}))
            sys.exit(1)

    # [수정 4] 송출 모드인데 IP가 없으면 에러 발생
    if not args.ip:
        parser.error("the following arguments are required: --ip")

    # --- 여기서부터는 기존 송출 로직 ---
    
    # 장치 ID 처리 (문자열/숫자 호환)
    try:
        device_id = int(args.device) if args.device is not None else None
    except ValueError:
        device_id = args.device

    ffmpeg_cmd = [
        'ffmpeg', '-y',
        '-f', 'f32le', '-ar', str(SAMPLE_RATE), '-ac', str(CHANNELS), '-i', 'pipe:0',
        '-ar', '16000', '-ac', '1',
        '-af', f'aresample=16000,asetnsamples=320,volume={args.volume}', # 볼륨 조절
        '-c:a', 'libopus', '-b:a', '24k', '-vbr', 'off',
        '-application', 'lowdelay', '-frame_duration', str(FRAME_MS),
        '-f', 'rtp', '-payload_type', '111', '-ssrc', '305419896',
        f'rtp://{args.ip}:{args.port}'
    ]

    print(f"[Python] Starting stream to {args.ip}:{args.port} using Device: {device_id}")
    
    # FFmpeg 실행
    process = subprocess.Popen(
        ffmpeg_cmd, 
        stdin=subprocess.PIPE, 
        stderr=subprocess.PIPE # 에러 로그 확인용 (필요시 DEVNULL로 변경)
    )

    def callback(indata, frames, time, status):
        if status:
            print(f"[Audio Status] {status}", file=sys.stderr)
        try:
            process.stdin.write(indata.tobytes())
        except Exception:
            raise sd.CallbackAbort

    try:
        with sd.InputStream(samplerate=SAMPLE_RATE, blocksize=BLOCK_SIZE,
                            channels=CHANNELS, dtype='float32',
                            callback=callback, device=device_id):
            print("[Python] Recording... (Press Ctrl+C to stop)")
            
            # 프로세스 감시 루프
            while process.poll() is None:
                sd.sleep(100)
                
                # FFmpeg 에러 로그 실시간 출력 (디버깅용)
                # err = process.stderr.read(1024)
                # if err: print(err.decode(), end='', file=sys.stderr)

    except KeyboardInterrupt:
        print("\n[Python] Stopping...")
    except Exception as e:
        print(f"\n[Python] Error: {e}")
    finally:
        if process.poll() is None:
            process.terminate()

if __name__ == '__main__':
    main()
