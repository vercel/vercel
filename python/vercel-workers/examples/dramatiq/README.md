# Dramatiq on Vercel Queues Example

This example demonstrates how to use [Dramatiq](https://dramatiq.io/) with Vercel Queues as the message broker backend.

## Setup

1. Install dependencies:

```bash
uv sync
```

2. Set up your Vercel Queue credentials:

```bash
export VERCEL_QUEUE_TOKEN="your-vercel-queue-token"
# Optionally, if using a custom queue service:
# export VERCEL_QUEUE_BASE_URL="https://your-queue-service.com"
```

## Running Locally

### Start the API server

```bash
uvicorn main:app --reload
```

### Start the polling worker (in another terminal)

```bash
python worker.py
```

### Enqueue tasks

```bash
# Add two numbers
curl -X POST http://localhost:8000/enqueue/add \
  -H "Content-Type: application/json" \
  -d '{"x": 5, "y": 3}'

# Multiply two numbers
curl -X POST http://localhost:8000/enqueue/multiply \
  -H "Content-Type: application/json" \
  -d '{"x": 4, "y": 7}'

# Greet someone
curl -X POST http://localhost:8000/enqueue/greet \
  -H "Content-Type: application/json" \
  -d '{"name": "World"}'
```

## Deploying to Vercel

1. Create a `vercel.json` in your project:

```json
{
  "queues": {
    "dramatiq": {
      "maxRetries": 3
    }
  }
}
```

2. Create a callback route for the queue trigger. For example, create `api/queue.py`:

```python
from vercel.workers.dramatiq import VercelQueuesBroker, get_wsgi_app
import dramatiq

# Set up the broker
broker = VercelQueuesBroker()
dramatiq.set_broker(broker)

# Import your actors to register them
from tasks import add, multiply, greet

# Create the WSGI app
app = get_wsgi_app(broker)
```

3. Configure your `vercel.json` to route queue events to the callback:

```json
{
  "queues": {
    "dramatiq": {
      "maxRetries": 3
    }
  },
  "routes": [
    {
      "src": "/api/queue",
      "dest": "/api/queue.py"
    }
  ]
}
```

## Architecture

1. **VercelQueuesBroker**: A Dramatiq broker that sends messages to Vercel Queues instead of Redis/RabbitMQ.

2. **Task Execution**: 
   - On Vercel: Queue triggers call the callback route, which executes the task.
   - Locally: The `PollingWorker` polls the queue and executes tasks.

3. **Message Format**: Tasks are serialized as JSON envelopes containing:
   - Actor name
   - Arguments
   - Message ID
   - Options (retries, delay, etc.)

## Key Differences from Standard Dramatiq

- No need for Redis or RabbitMQ
- Tasks are executed via HTTP callbacks in serverless environments
- Use `PollingWorker` for local development instead of `dramatiq worker`
- Message persistence and retries are handled by Vercel Queues

