from flask import Flask, jsonify
from pydantic import BaseModel

app = Flask(__name__)


class Status(BaseModel):
    ok: bool
    flask_version: str
    pydantic_version: str


@app.get("/")
def index():
    import flask
    import pydantic

    status = Status(
        ok=True,
        flask_version=flask.__version__,
        pydantic_version=pydantic.__version__,
    )
    return jsonify(status.model_dump())
