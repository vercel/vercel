from flask import Flask


app = Flask(__name__)


@app.get("/")
def read_root():
    return "ok"


@app.get("/api/token/<string:token>/status")
def get_token_status(token: str):
    return f"ok:{token}"
