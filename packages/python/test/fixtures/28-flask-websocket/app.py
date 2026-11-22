from flask import Flask
from flask_sock import Sock

app = Flask(__name__)
sock = Sock(app)


@app.route("/")
def index():
    return "flask-websocket ok"


@sock.route("/ws")
def ws(ws):
    while True:
        data = ws.receive()
        if data is None:
            break
        ws.send(f"echo:{data}")


if __name__ == "__main__":
    app.run(debug=True, port=8002)
