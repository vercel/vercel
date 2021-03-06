import os
from flask import Flask
app = Flask(__name__)


@app.route("/")
def index():
    random = os.environ['RANDOMNESS']
    return random + ":env"
