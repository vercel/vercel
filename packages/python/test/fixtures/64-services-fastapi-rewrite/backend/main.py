from fastapi import FastAPI, Request

app = FastAPI()


@app.get("/")
def root(request: Request):
    return {"service": "backend", "path": request.url.path}


@app.get("/users/{user_id}")
def user(user_id: str, request: Request):
    return {
        "service": "backend",
        "user_id": user_id,
        "path": request.url.path,
    }
