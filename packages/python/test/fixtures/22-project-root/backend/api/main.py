from fastapi import FastAPI

app = FastAPI()


@app.get("/api/hello/{name}")
def read_api_hello(name: str):
    return f"Hello, {name}!"
