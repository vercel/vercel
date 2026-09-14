import time
from logging import getLogger
from uuid import uuid4

from flask import Flask, jsonify, request
from vercel.cache import get_cache

from worker.broker import broker
from worker.tasks import send_email, generate_report

logger = getLogger(__name__)

app = Flask(__name__)


def _resolve_request_id(payload: dict) -> str:
    incoming = payload.get("request_id")
    request_id = str(incoming) if incoming else str(uuid4())
    payload["request_id"] = request_id
    return request_id


@app.get("/")
def root():
    return jsonify({"message": "Hello from Flask web service"})


@app.post("/enqueue/email")
def enqueue_email():
    payload = request.get_json(silent=True) or {}
    request_id = _resolve_request_id(payload)
    try:
        message = send_email.send(payload)
    except Exception as exc:
        logger.error(f"Failed to enqueue email job: {exc}")
        return jsonify({"ok": False, "error": str(exc)}), 500
    return jsonify(
        {
            "ok": True,
            "jobId": message.message_id,
            "requestId": request_id,
            "topic": "emails",
        }
    )


@app.post("/enqueue/report")
def enqueue_report():
    payload = request.get_json(silent=True) or {}
    request_id = _resolve_request_id(payload)
    try:
        message = generate_report.send(payload)
    except Exception as exc:
        logger.error(f"Failed to enqueue report job: {exc}")
        return jsonify({"ok": False, "error": str(exc)}), 500
    return jsonify(
        {
            "ok": True,
            "jobId": message.message_id,
            "requestId": request_id,
            "topic": "reports",
        }
    )


@app.get("/status/<topic>/<request_id>")
def status(topic: str, request_id: str):
    cache = get_cache(namespace=topic)
    deadline = time.time() + 30
    while time.time() < deadline:
        result = cache.get(request_id)
        if result is not None:
            return jsonify({"ok": True, "processed": True, "result": result})
        time.sleep(0.5)
    return jsonify({"ok": False, "processed": False, "error": "timeout"}), 504


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.errorhandler(404)
def not_found_handler(error):
    return jsonify({"detail": "404 from Flask web service"}), 404
