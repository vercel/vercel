SECRET_KEY = "fixture-secret-key"
DEBUG = False
ROOT_URLCONF = "web.urls"
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
]

MIDDLEWARE = [
    "django.middleware.common.CommonMiddleware",
]

TASKS = {
    "default": {
        "BACKEND": "vercel.workers.django.VercelQueuesBackend",
        "QUEUES": ["jobs"],
    }
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

USE_TZ = True
