from fastapi import FastAPI


app = FastAPI()


@app.get('/backend')
def api_root():
    return {'message': 'Hello from FastAPI'}


@app.get('/backend/health')
def health():
    return {'status': 'ok'}
