#!/usr/bin/env python
import os
import sys

# Load .env.local for local development (e.g. DATABASE_URL); check parent dir too
_base = os.path.dirname(os.path.abspath(__file__))
_env_file = os.path.join(_base, '.env.local')
if not os.path.exists(_env_file):
    _env_file = os.path.join(os.path.dirname(_base), '.env.local')
if os.path.exists(_env_file):
    with open(_env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, _, value = line.partition('=')
                os.environ.setdefault(key.strip(), value.strip().strip('"\''))


def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError("Couldn't import Django.") from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
