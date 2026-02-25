from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()


@app.get('/api/py')
def api_root():
    return {'message': 'Hello from FastAPI'}


@app.get('/api/py/health')
def health():
    return {'status': 'ok'}


@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(status_code=404, content={'detail': '404 from FastAPI'})
