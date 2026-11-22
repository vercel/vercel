from fastapi import FastAPI
from python_lib import greet


app = FastAPI()


@app.get("/api/greet/{name}")
def greet_user(name: str):
    return {"message": greet(name)}
