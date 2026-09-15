#!/usr/bin/env python3
"""캐시를 금지하는 로컬 서버. 항상 최신 index.html을 준다."""
import http.server, os, sys
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
os.chdir(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache'); self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('', PORT), H).serve_forever()
