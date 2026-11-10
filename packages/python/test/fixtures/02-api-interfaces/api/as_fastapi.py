from fastapi import FastAPI
from pydantic import BaseModel


class RequestData(BaseModel):
    name: str


app = FastAPI()


@app.post("/api/as_fastapi")
async def echo(data: RequestData):
    return {'name': data.name}
