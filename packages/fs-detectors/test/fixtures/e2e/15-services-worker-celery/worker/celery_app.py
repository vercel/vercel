from vercel.workers.celery import Celery

app = Celery("worker")
