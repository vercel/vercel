from flask import Flask, jsonify, render_template_string, request

from worker.broker import broker
from worker.tasks import process_job

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


@app.get('/')
def root():
    return render_template_string(INDEX_HTML)


@app.post('/enqueue')
def enqueue():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        payload = {}

    try:
        message = process_job.send(payload)
    except Exception as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 500

    return jsonify(
        {
            'ok': True,
            'jobId': message.message_id,
            'queueName': message.queue_name,
            'actorName': message.actor_name,
            'broker': broker.__class__.__name__,
        }
    )


@app.get('/health')
def health():
    return jsonify({'status': 'ok'})


@app.errorhandler(404)
def not_found_handler(error):
    return jsonify({'detail': '404 from Flask web service'}), 404
