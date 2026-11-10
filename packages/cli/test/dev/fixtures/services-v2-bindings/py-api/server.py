from fastapi import FastAPI

app = FastAPI()


@app.get("/hello")
def hello():
    return {"service": "py_api", "ok": True}
