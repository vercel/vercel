# Subscriber entrypoint ("worker:app"). Importing tasks registers the Celery
# task on the app so the queue trigger can execute it.
from tasks import app

__all__ = ["app"]
