from http.server import HTTPServer
import os
import sys
__HANDLER_CLASS_TEMPLATE

if __name__ == "__main__":
    hostName = "localhost"
    errorMessage = 'Neither `app` nor `handler` defined in serverless function {}. See: https://vercel.com/docs/functions/serverless-functions/runtimes/python'.format(__file__)

    if 'handler' in dir():
        appOrHandler = handler
    
    if 'app' in dir():
        appOrHandler = app

    if not 'appOrHandler' in dir():
        raise Exception(errorMessage)

    # Port 0 is unix-speak for 'first available port'
    httpd = HTTPServer((hostName, 0), appOrHandler)
    serverPort = httpd.socket.getsockname()[1]

    print("Server started http://%s:%s" % (hostName, serverPort))

    fd = os.open("pipe", os.O_RDWR|os.O_CREAT)
    with os.fdopen(fd, 'w') as fdfile:
        fdfile.write(str(serverPort))
        fdfile.close()
        
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass

    httpd.server_close()
    print("Server stopped.")