from fastapi import FastAPI
from pydantic import BaseModel


class RequestData(BaseModel):
    name: str


app = FastAPI()


@app.post("/api/hello")
async def xinchao(data: RequestData):
    return {'name': data.name}
