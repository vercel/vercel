import os
from flask import Flask
app = Flask(__name__)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def index(path):
    random = os.environ['RANDOMNESS']
    return random + ":env"
