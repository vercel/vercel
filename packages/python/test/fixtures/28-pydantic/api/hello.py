from fastapi import FastAPI
from pydantic import BaseModel


class RequestData(BaseModel):
    name: str


app = FastAPI()


@app.post("/")
async def xinchao(data: RequestData):
    return {'name': data.name}
