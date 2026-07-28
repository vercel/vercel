from fastapi import FastAPI

app = FastAPI()

app.frontend("/", directory="frontend", fallback="index.html")
