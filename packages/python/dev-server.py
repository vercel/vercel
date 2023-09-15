# Python 3 Socket Server
# import socketserver
# import os

# class Handler_TCPServer(socketserver.BaseRequestHandler):
#     """
#     The TCP Server class for demonstration.

#     Note: We need to implement the Handle method to exchange data
#     with TCP client.
    
#     """

#     def handle(self):
#         # self.request - TCP socket connected to the client
#         self.data = self.request.recv(1024).strip()
#         print("{} sent:".format(self.client_address[0]))
#         print(self.data)
#         # just send back ACK for data arrival confirmation
#         self.request.sendall("ACK from TCP Server".encode())

# if __name__ == "__main__":
#     print("Starting server on port 9999")
#     HOST, PORT = "localhost", 9999

#     # Init the TCP server object, bind it to the localhost on 9999 port
#     tcp_server = socketserver.TCPServer((HOST, PORT), Handler_TCPServer)

#     with os.fdopen(3, 'w') as fdfile:
#         fdfile.write(os.getpid())
#         fdfile.close()

#     print(os.getpid())
#     # Activate the TCP server.
#     # To abort the TCP server, press Ctrl-C.
#     tcp_server.serve_forever()

# Python 3 HTTP Server
from http.server import HTTPServer
import os

hostName = "localhost"
serverPort = 9999

# from http.server import BaseHTTPRequestHandler
# class handler(BaseHTTPRequestHandler):
#     def do_GET(self):
#         print("I got here!")
#         self.send_response(200)
#         self.send_header('Content-type','text/plain')
#         self.end_headers()
#         self.wfile.write('Hello, world!'.encode('utf-8'))
#         return

__HANDLER_CLASS_TEMPLATE

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

    # with os.fdopen(3, 'w') as fdfile:
    #     fdfile.write(str(serverPort))
    #     fdfile.close()
        
    try:
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
    print("Server stopped.")