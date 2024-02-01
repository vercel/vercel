from flask import Flask
app = Flask(__name__)


@app.route("/api")
def index():
    return "wsgi:RANDOMNESS_PLACEHOLDER"
