import http.server
import socketserver
import os

PORT = 8000

# Define the directory to serve files from
os.chdir(os.path.dirname(__file__))

# Handler to serve files from the specified directory
Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Server started. Navigate to http://localhost:{PORT}/ in your web browser to view.")
    httpd.serve_forever()
