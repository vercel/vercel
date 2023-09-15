from http.server import HTTPServer
import os

hostName = "localhost"
serverPort = 9999

from http.server import BaseHTTPRequestHandler
class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        print("I got here!")
        self.send_response(200)
        self.send_header('Content-type','text/plain')
        self.end_headers()
        self.wfile.write('Hello, world!'.encode('utf-8'))
        return

# __HANDLER_CLASS_TEMPLATE

if __name__ == "__main__":
    errorMessage = 'Neither `app` nor `handler` defined in serverless function {}. See: https://vercel.com/docs/functions/serverless-functions/runtimes/python'.format(__file__)

    if 'handler' in dir():
        appOrHandler = handler
    
    if 'app' in dir():
        appOrHandler = app

    if not 'appOrHandler' in dir():
        raise Exception(errorMessage)

    webServer = HTTPServer((hostName, serverPort), appOrHandler)
    print("Server started http://%s:%s" % (hostName, serverPort))

    with os.fdopen(3, 'w') as fdfile:
        fdfile.write(str(serverPort))
        fdfile.close()
        
    try:
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
    print("Server stopped.")