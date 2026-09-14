from fastapi import FastAPI

app = FastAPI()


@app.get('/')
async def root():
    return {'message': 'Hello from FastAPI web service'}


@app.get('/health')
async def health():
    return {'status': 'ok'}
