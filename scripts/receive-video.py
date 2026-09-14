"""Receive ordered WebCodecs chunks on loopback and mux directly to MP4.

Usage: python3 -u scripts/receive-video.py tmp/videos/preset.mp4 [fps]
Prints the endpoint for sceneVideo.run() in /build.html?verify=render.
"""
import json
import secrets
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

output = Path(sys.argv[1]).resolve()
fps = int(sys.argv[2]) if len(sys.argv) > 2 else 60
if fps not in (30, 60):
    raise ValueError("Use 30 or 60 fps")
if output.exists():
    raise FileExistsError(output)
output.parent.mkdir(parents=True, exist_ok=True)
token = secrets.token_hex(12)
log = output.with_suffix('.ffmpeg.log').open('wb')
process = subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'warning',
    '-r', str(fps), '-f', 'h264', '-i', 'pipe:0', '-c:v', 'copy',
    '-bsf:v', f'setts=ts=N/({fps}*TB):duration=1/({fps}*TB)',
    '-movflags', '+faststart', '-n', str(output)], stdin=subprocess.PIPE,
    stdout=subprocess.DEVNULL, stderr=log)


class Receiver(BaseHTTPRequestHandler):
    sequence = 0

    def reply(self, status, data):
        self.send_response(status)
        self.send_header('Access-Control-Allow-Origin', 'http://127.0.0.1:5215')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self.reply(200, {})

    def do_POST(self):
        if self.headers.get('Origin') != 'http://127.0.0.1:5215':
            self.reply(403, {'error': 'Unexpected origin'})
            return
        size = int(self.headers.get('Content-Length', 0))
        if not 0 < size < 32 * 1024 * 1024:
            self.reply(400, {'error': 'Invalid body length'})
            return
        data = self.rfile.read(size)
        if self.path == f'/{token}/chunk?sequence={Receiver.sequence}':
            process.stdin.write(data)
            process.stdin.flush()
            Receiver.sequence += 1
            self.reply(200, {'sequence': Receiver.sequence})
        elif self.path == f'/{token}/finish':
            metadata = json.loads(data)
            if metadata['fps'] != fps:
                self.reply(400, {'error': 'FPS differs from receiver'})
                return
            process.stdin.close()
            status = process.wait(timeout=60)
            if status:
                self.reply(500, {'error': f'FFmpeg exited with {status}'})
            else:
                output.with_suffix('.json').write_text(json.dumps(metadata, indent=2))
                self.reply(200, {'path': str(output), 'bytes': output.stat().st_size})
            self.server.finished = True
        else:
            self.reply(409, {'error': 'Unknown endpoint or out-of-order chunk'})

    def log_message(self, *_):
        pass


server = HTTPServer(('127.0.0.1', 0), Receiver)
server.timeout = 180
server.finished = False
print(f'http://127.0.0.1:{server.server_port}/{token}', flush=True)
try:
    while not server.finished:
        server.handle_request()
finally:
    server.server_close()
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=10)
    log.close()
