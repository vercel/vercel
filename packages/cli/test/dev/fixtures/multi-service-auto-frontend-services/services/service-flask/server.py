import os
from flask import Flask, jsonify

base_path = os.environ.get("VERCEL_SERVICE_BASE_PATH", "")
app = Flask(__name__)

@app.route(f"{base_path}/")
def root():
    return jsonify({
        "framework": "flask",
        "service": "service-flask",
    })
