import time
from datetime import UTC, datetime
from decimal import Decimal
from logging import getLogger
from uuid import uuid4

from flask import Flask, jsonify, render_template_string, request
from vercel.cache import get_cache

from worker.tasks import process_job

logger = getLogger(__name__)

app = Flask(__name__)

INDEX_HTML = """
<!doctype html>
<html>
  <body>
    <h1>Hello from Flask web service</h1>
    <button id="enqueue-btn" type="button">Enqueue Job</button>
    <p id="status"></p>

    <script>
      const btn = document.getElementById('enqueue-btn');
      const status = document.getElementById('status');

      btn.addEventListener('click', async () => {
        status.textContent = 'Enqueuing...';
        btn.disabled = true;
        try {
          const response = await fetch('/enqueue', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ source: 'fixture-web-ui' }),
          });
          const data = await response.json();
          if (!response.ok || !data.ok) {
            throw new Error(data.error || String(response.status));
          }
          status.textContent = `Job id: ${data.jobId}`;
        } catch (error) {
          status.textContent = `Failed: ${String(error)}`;
        } finally {
          btn.disabled = false;
        }
      });
    </script>
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
    payload["enqueued_at"] = datetime.now(UTC)
    payload["priority"] = Decimal("1.5")

    try:
        result = process_job.delay(payload)
    except Exception as exc:
        logger.error(f"Failed to enqueue job: {exc}")
        return jsonify({"ok": False, "error": str(exc)}), 500

    return jsonify({"ok": True, "jobId": str(result.id), "requestId": payload["request_id"]})


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
