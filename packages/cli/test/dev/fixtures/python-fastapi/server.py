from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
from endpoints.users import router as users_router

app = FastAPI()

app.include_router(users_router)

@app.get("/")
def read_root():
    return {"message": "Hello, World!"}

@app.get("/api")
def read_api():
    return {"message": "Hello, API!"}

@app.get("/api/hello/{name}")
def read_api_hello(name: str):
    return {"message": f"Hello, {name}!"}

@app.get("/headers", response_class=PlainTextResponse)
async def headers(request: Request):
    url = request.headers.get('x-vercel-deployment-url')
    return url or ""

@app.get("/query")
def query(param: str = None):
    return {"received_param": param or "missing"}
