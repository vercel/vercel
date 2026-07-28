from fastapi import FastAPI

app = FastAPI()


@app.get("/protected/pass")
async def protected_pass():
    return {"source": "fastapi"}


@app.get("/unmatched")
async def unmatched():
    return {"source": "fastapi-unmatched"}
