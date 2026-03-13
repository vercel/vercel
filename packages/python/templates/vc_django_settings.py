"""
Discover Django settings by running manage.py with a patched
execute_from_command_line. This lets manage.py set DJANGO_SETTINGS_MODULE
via whatever mechanism it uses (os.environ.setdefault, conditionals, etc.),
then loads the settings module and prints all uppercase attributes as JSON.
"""

import os, sys, json, runpy
import django.core.management


class _Escape(Exception):
    pass


def _stop(*a, **kw):
    raise _Escape


django.core.management.execute_from_command_line = _stop

sys.argv = ["manage.py"]
try:
    runpy.run_path("manage.py", run_name="__main__")
except _Escape:
    pass

settings_module = os.environ.get("DJANGO_SETTINGS_MODULE")
if not settings_module:
    print(json.dumps(None))
else:
    import importlib

    mod = importlib.import_module(settings_module)
    settings = {k: getattr(mod, k) for k in dir(mod) if k.isupper()}
    print(
        json.dumps(
            {
                "settings_module": settings_module,
                "django_settings": settings,
            },
            default=str,
        )
    )
