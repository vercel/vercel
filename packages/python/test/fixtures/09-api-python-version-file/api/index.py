import sys
from flask import Flask, jsonify
app = Flask(__name__)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def index(path):
    return jsonify(major=sys.version_info.major, minor=sys.version_info.minor)
