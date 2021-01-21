from sanic import Sanic
from sanic.response import json
app = Sanic()

@app.route('/')
@app.route('/<path:path>')
async def index(request, path=""):
    return json({
        "parsed": True,
        "url": request.url,
        "query_string": request.query_string,
        "args": request.args,
        "query_args": request.query_args,
     })

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=8003)
