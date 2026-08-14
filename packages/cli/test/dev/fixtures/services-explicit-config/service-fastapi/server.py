from fastapi import FastAPI

app = FastAPI()


@app.get('/')
def root():
    return {
        "framework": "fastapi",
        "service": "service-fastapi",
    }
