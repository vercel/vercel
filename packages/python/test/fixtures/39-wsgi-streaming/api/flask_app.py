from flask import Flask, Response
import time

app = Flask(__name__)

@app.route("/api/flask_app")
def flask_stream():
    def generate():
        yield "It's working if you see the numbers being printed once per second:\n"
        for i in range(1, 6):
            print(i)
            yield f"{i}\n"
            time.sleep(1)
    return Response(generate(), mimetype="text/plain")
