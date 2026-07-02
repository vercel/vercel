# A standard-size function (well below the Lambda size limit) with
# VERCEL_PYTHON_COMPILEALL=1 and no VERCEL_SUPPORT_LARGE_FUNCTIONS.
# Verifies precompiled bytecode ships in the bundle: PYTHONDONTWRITEBYTECODE
# is set at runtime and /var/task is read-only, so any .pyc present must have
# been produced at build time.
from pathlib import Path

from flask import Flask, jsonify

app = Flask(__name__)


def has_pyc(directory: Path) -> bool:
    pycache = directory / "__pycache__"
    return pycache.is_dir() and any(pycache.glob("*.pyc"))


@app.get("/")
def index():
    import flask

    return jsonify(
        ok=True,
        app_pyc=has_pyc(Path(__file__).parent),
        vendor_pyc=has_pyc(Path(flask.__file__).parent),
    )
