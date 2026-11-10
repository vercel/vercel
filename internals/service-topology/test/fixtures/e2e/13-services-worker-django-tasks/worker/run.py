import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "worker.settings")

import django
django.setup()

from worker import tasks  # noqa: F401
