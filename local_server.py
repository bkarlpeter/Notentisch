from __future__ import annotations

import hmac
import json
import os
import secrets
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


class NotentischHandler(SimpleHTTPRequestHandler):
    ALLOWED_AUDIO_EXTENSIONS = {'.webm', '.ogg', '.wav', '.m4a', '.mp3'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == '/__audio_upload__':
            self._handle_audio_upload(parsed)
            return

        if parsed.path == '/__shutdown__':
            # Shutdown nur mit gültigem Session-Token erlauben.
            # Das reduziert unbeabsichtigte Stopps durch andere lokale Browser-Tabs/Tools.
            if not self._is_valid_shutdown_request():
                self.send_error(403, 'Forbidden')
                return
            self._handle_shutdown()
            return
        super().do_POST()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == '/__session__':
            # Der Browser holt hier das aktuelle Shutdown-Token für diese Server-Session.
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            payload = {'shutdownToken': getattr(self.server, 'shutdown_token', '')}
            self.wfile.write(json.dumps(payload).encode('utf-8'))
            return
        if parsed.path == '/__shutdown__':
            # Shutdown via GET ist bewusst deaktiviert.
            self.send_error(405, 'Method Not Allowed')
            return
        super().do_GET()

    def _handle_audio_upload(self, parsed) -> None:
        # Uploads sind auf das Arbeitsverzeichnis des lokalen Notentisch-Servers beschränkt.
        # Dadurch kann der Browser nicht beliebige Pfade auf dem System beschreiben.
        query = parse_qs(parsed.query)
        raw_name = (query.get('filename') or [''])[0]
        safe_name = self._sanitize_sound_filename(raw_name)
        if not safe_name:
            self.send_error(400, 'Invalid filename')
            return

        extension = Path(safe_name).suffix.lower()
        if extension not in self.ALLOWED_AUDIO_EXTENSIONS:
            self.send_error(400, 'Unsupported file extension')
            return

        try:
            content_length = int(self.headers.get('Content-Length', '0') or '0')
        except ValueError:
            self.send_error(400, 'Invalid Content-Length')
            return
        if content_length <= 0:
            self.send_error(400, 'Missing body')
            return
        if content_length > 25 * 1024 * 1024:
            self.send_error(413, 'File too large')
            return

        sound_dir = Path(os.getcwd()) / 'mysounds'
        sound_dir.mkdir(parents=True, exist_ok=True)
        target = sound_dir / safe_name
        payload = self.rfile.read(content_length)
        target.write_bytes(payload)

        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        relative_path = 'mysounds/' + safe_name
        self.wfile.write(json.dumps({'ok': True, 'path': relative_path}).encode('utf-8'))

    def _sanitize_sound_filename(self, value: str) -> str:
        base = os.path.basename((value or '').strip())
        allowed = ''.join(ch for ch in base if ch.isalnum() or ch in ('-', '_', '.'))
        if not allowed or allowed.startswith('.') or len(allowed) > 120:
            return ''
        return allowed

    def _is_valid_shutdown_request(self) -> bool:
        token = self.headers.get('X-Notentisch-Token', '')
        expected = getattr(self.server, 'shutdown_token', '')
        if not expected or not token:
            return False

        # Timing-sicherer Vergleich für den Session-Token.
        if not hmac.compare_digest(token, expected):
            return False

        content_length = int(self.headers.get('Content-Length', '0') or '0')
        body = self.rfile.read(content_length) if content_length > 0 else b''
        return body.decode('utf-8', errors='ignore').strip() == 'shutdown'

    def _handle_shutdown(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write('Server wird beendet...'.encode('utf-8'))

        threading.Thread(target=self.server.shutdown, daemon=True).start()


def main() -> int:
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f'Ungueltiger Port: {sys.argv[1]}')
            return 2

    webroot = os.path.dirname(os.path.abspath(__file__))
    os.chdir(webroot)

    server = ThreadingHTTPServer(('127.0.0.1', port), NotentischHandler)
    # Pro Start ein neues Token, damit alte Requests nicht wiederverwendet werden können.
    server.shutdown_token = secrets.token_urlsafe(24)
    print(f'Server gestartet: http://localhost:{port}/board.html')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print('Server beendet.')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
