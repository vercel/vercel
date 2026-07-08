from fastapi import FastAPI

app = FastAPI()

app.frontend("/", directory="my_files")
