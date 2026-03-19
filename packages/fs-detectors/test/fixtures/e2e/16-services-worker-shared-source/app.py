from logging import getLogger

from flask import Flask, jsonify, request

from worker.broker import broker
from worker.tasks import send_email, generate_report

logger = getLogger(__name__)

app = Flask(__name__)


@app.get("/")
def root():
    return jsonify({"message": "Hello from Flask web service"})


@app.post("/enqueue/email")
def enqueue_email():
    payload = request.get_json(silent=True) or {}
    try:
        message = send_email.send(payload)
    except Exception as exc:
        logger.error(f"Failed to enqueue email job: {exc}")
        return jsonify({"ok": False, "error": str(exc)}), 500
    return jsonify({"ok": True, "jobId": message.message_id, "topic": "emails"})


@app.post("/enqueue/report")
def enqueue_report():
    payload = request.get_json(silent=True) or {}
    try:
        message = generate_report.send(payload)
    except Exception as exc:
        logger.error(f"Failed to enqueue report job: {exc}")
        return jsonify({"ok": False, "error": str(exc)}), 500
    return jsonify({"ok": True, "jobId": message.message_id, "topic": "reports"})


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.errorhandler(404)
def not_found_handler(error):
    return jsonify({"detail": "404 from Flask web service"}), 404
