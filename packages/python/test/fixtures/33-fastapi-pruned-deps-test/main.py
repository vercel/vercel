from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.responses import StreamingResponse


app = FastAPI()

@app.get("/hello")
async def stream():
    return {"message": "Hello, World!"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
