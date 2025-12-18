from fastapi import FastAPI

app = FastAPI()

@app.get("/api/fastapi")
def read_root():
    return {"message": "Hello, world!"}
