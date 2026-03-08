from __future__ import annotations

import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NotentischHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_POST(self):
        if self.path == '/__shutdown__':
            self._handle_shutdown()
            return
        super().do_POST()

    def do_GET(self):
        if self.path == '/__shutdown__':
            self._handle_shutdown()
            return
        super().do_GET()

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
