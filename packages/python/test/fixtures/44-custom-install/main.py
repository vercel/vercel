import fastapi
import tabulate
from fastapi import FastAPI


app = FastAPI()


@app.get("/")
def root():
    return "ok"


@app.get("/api/versions")
def versions():
    return {"fastapi": fastapi.__version__, "tabulate": tabulate.__version__}
