from flask import Flask


test = Flask(__name__)


@test.get("/")
def read_root():
    return "ok"


@test.get("/api/token/<string:token>/status")
def get_token_status(token: str):
    return f"ok:{token}"
