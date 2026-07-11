import time
from logging import getLogger
from uuid import uuid4

from flask import Flask, jsonify, render_template_string, request
from vercel.cache import get_cache

from worker.broker import broker
from worker.tasks import process_order, process_event

logger = getLogger(__name__)

app = Flask(__name__)

INDEX_HTML = """
<!doctype html>
<html>
  <body>
    <h1>Hello from Flask web service (multiple topics)</h1>
    <button id="enqueue-btn" type="button">Enqueue Jobs</button>
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
            body: JSON.stringify({ orderId: '12345', eventId: '54321', action: 'ship' }),
          });
          const data = await response.json();
          if (!response.ok || !data.ok) {
            throw new Error(data.error || String(response.status));
          }
          status.textContent = `Job IDs: ${data.jobs[0].jobId}, ${data.jobs[1].jobId}`;
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
        payload = {
          'orderId': 42,
          'eventId': 24,
          'action': 'test'
        }

    incoming_request_id = payload.get('request_id')
    request_id = str(incoming_request_id) if incoming_request_id else str(uuid4())

    try:
        order_payload = payload.copy()
        order_payload['request_id'] = request_id
        order_payload.pop('eventId', 0)
        order_msg = process_order.send(order_payload)

        event_payload = payload.copy()
        event_payload['request_id'] = request_id
        event_payload.pop('orderId', 0)
        event_msg = process_event.send(event_payload)
    except Exception as exc:
        logger.error(f"Failed to enqueue job: {exc}")
        return jsonify({"ok": False, "error": str(exc)}), 500

    return jsonify(
        {
            "ok": True,
            "requestId": request_id,
            "jobs": [
                {
                    "jobId": order_msg.message_id,
                    "queueName": order_msg.queue_name,
                },
                {
                    "jobId": event_msg.message_id,
                    "queueName": event_msg.queue_name,
                },
            ],
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
