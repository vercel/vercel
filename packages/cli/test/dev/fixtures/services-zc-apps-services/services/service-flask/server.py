from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/")
def root():
    return jsonify({
        "framework": "flask",
        "service": "service-flask",
    })
