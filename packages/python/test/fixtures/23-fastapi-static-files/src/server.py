from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello, World!"}

@app.get("/api")
def read_api():
    return {"message": "Hello, API!"}

@app.get("/api/hello/{name}")
def read_api_hello(name: str):
    return {"message": f"Hello, {name}!"}

# Note: do not mount or read from `public/` here; in production the platform
# serves files in `public/` at the root path (e.g. `/logo.svg`).
