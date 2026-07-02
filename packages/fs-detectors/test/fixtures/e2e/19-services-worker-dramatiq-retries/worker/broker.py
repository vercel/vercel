import dramatiq
from vercel.workers.dramatiq import VercelQueuesBroker


# Explicitly configure Dramatiq to publish via Vercel Queues.
broker = VercelQueuesBroker()
dramatiq.set_broker(broker)
