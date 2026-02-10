from fastapi import FastAPI


app = FastAPI()


@app.get('/api/py')
def api_root():
    return {'message': 'Hello from FastAPI'}


@app.get('/api/py/health')
def health():
    return {'status': 'ok'}
