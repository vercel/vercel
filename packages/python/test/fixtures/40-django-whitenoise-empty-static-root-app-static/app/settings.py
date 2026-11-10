import os
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECRET_KEY = 'test-secret-key'
DEBUG = False
ALLOWED_HOSTS = ['*']
INSTALLED_APPS = ['django.contrib.staticfiles', 'app']
MIDDLEWARE = ['whitenoise.middleware.WhiteNoiseMiddleware']
ROOT_URLCONF = 'app.urls'
WSGI_APPLICATION = 'app.wsgi.application'
DATABASES = {}
STATIC_URL = '/static/'
WHITENOISE_USE_FINDERS = True
