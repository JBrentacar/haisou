#!/usr/bin/env python3
"""
配送料金算出システム - 開発用サーバー
"""
import http.server
import socketserver
import sys

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # CORSヘッダーを追加
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def log_message(self, format, *args):
        # ログ出力をカスタマイズ
        sys.stdout.write(f"{self.log_date_time_string()} - {format % args}\n")
        sys.stdout.flush()

def main():
    handler = MyHTTPRequestHandler
    
    with socketserver.TCPServer(("0.0.0.0", PORT), handler) as httpd:
        print(f"🚀 配送料金算出システムを起動しました")
        print(f"📍 アクセスURL: http://localhost:{PORT}")
        print(f"🛑 停止するには Ctrl+C を押してください\n")
        sys.stdout.flush()
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n👋 サーバーを停止しました")
            sys.stdout.flush()

if __name__ == "__main__":
    main()
