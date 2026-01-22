import argparse
import sys
import subprocess
import sounddevice as sd
import numpy as np

SAMPLE_RATE = 16000
CHANNELS = 1
FRAME_MS = 20
BLOCK_SIZE = int(SAMPLE_RATE * FRAME_MS / 1000)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ip', required=True, help='Target IP')
    parser.add_argument('--port', type=int, default=4000, help='Target Port')
    parser.add_argument('--device', type=int, default=None, help='Input Device ID')
    args = parser.parse_args()

    # 입력 장치 정보 확인 (디버깅용)
    if args.device is not None:
        dev_info = sd.query_devices(args.device, 'input')
        print(f"[Python] Using Device {args.device}: {dev_info['name']}")

    ffmpeg_cmd = [
        'ffmpeg', '-y',
        '-f', 'f32le', '-ar', str(SAMPLE_RATE), '-ac', str(CHANNELS), '-i', 'pipe:0',
        '-ar', '16000', '-ac', '1',
        '-af', 'aresample=16000,asetnsamples=320',
        '-c:a', 'libopus', '-b:a', '24k', '-vbr', 'off',
        '-application', 'lowdelay', '-frame_duration', str(FRAME_MS),
        '-f', 'rtp', '-payload_type', '111', '-ssrc', '305419896',
        f'rtp://{args.ip}:{args.port}'
    ]

    print(f"[Python] Stream -> {args.ip}:{args.port}")
    
    process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

    def callback(indata, frames, time, status):
        if status:
            print(f"[Error] {status}", file=sys.stderr)
        
        # [핵심] 소리가 들어오는지 눈으로 확인하는 볼륨 미터
        volume_norm = np.linalg.norm(indata) * 10
        print("|" + "#" * int(volume_norm), end='\r', flush=True)

        try:
            process.stdin.write(indata.tobytes())
        except Exception:
            raise sd.CallbackAbort

    try:
        # device=args.device로 특정 장치를 강제 지정
        with sd.InputStream(samplerate=SAMPLE_RATE, blocksize=BLOCK_SIZE,
                            channels=CHANNELS, dtype='float32',
                            callback=callback, device=args.device):
            print("\n[Python] Recording... (Make some noise!)")
            process.wait()
    except KeyboardInterrupt:
        print("\n[Python] Stop")
    finally:
        if process.poll() is None:
            process.terminate()

if __name__ == '__main__':
    main()