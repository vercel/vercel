from fastapi import FastAPI

app = FastAPI()


@app.get("/ping")
def ping():
    return {"status": "ok", "source": "workspace-member"}
