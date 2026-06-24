import time
from logging import getLogger
from uuid import uuid4

from flask import Flask, jsonify, render_template_string, request
from vercel.cache import get_cache

from worker.broker import broker
from worker.tasks import flaky_job

logger = getLogger(__name__)

app = Flask(__name__)

INDEX_HTML = """
<!doctype html>
<html>
  <body>
    <h1>Hello from Flask web service</h1>
  </body>
</html>
"""


@app.get("/")
def root():
    return render_template_string(INDEX_HTML)


@app.post("/enqueue")
def enqueue():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        payload = {}

    incoming_request_id = payload.get("request_id")
    payload["request_id"] = str(incoming_request_id) if incoming_request_id else str(uuid4())

    try:
        message = flaky_job.send(payload)
    except Exception as exc:
        logger.error(f"Failed to enqueue job: {exc}")
        return jsonify({"ok": False, "error": str(exc)}), 500

    return jsonify(
        {
            "ok": True,
            "jobId": message.message_id,
            "requestId": payload["request_id"],
            "queueName": message.queue_name,
            "actorName": message.actor_name,
            "broker": broker.__class__.__name__,
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
