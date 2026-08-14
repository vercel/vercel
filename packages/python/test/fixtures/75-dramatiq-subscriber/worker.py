# Subscriber entrypoint ("worker:broker"). Importing tasks declares the
# Dramatiq actor's queues on the explicitly configured broker so the queue
# trigger can execute it.
from tasks import broker

__all__ = ["broker"]
