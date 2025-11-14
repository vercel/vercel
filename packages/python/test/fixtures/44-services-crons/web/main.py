from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return "ok"


@app.get("/api/hello")
def read_hello():
    return {"hello": "world!"}
