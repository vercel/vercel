from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def root():
    return {"service": "service-b", "message": "Hello from service-b"}
