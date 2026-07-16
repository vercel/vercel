# Standard-size function: verifies precompiled bytecode ships in the bundle.
# The runtime never writes .pyc, so any present were produced at build time.
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
