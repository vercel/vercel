from flask import Flask, Response, request

app = Flask(__name__)

@app.route("/")
def read_root():
    return {"message": "Hello, World!"}

@app.route("/api")
def read_api():
    return {"message": "Hello, API!"}

@app.route("/api/hello/<name>")
def read_api_hello(name):
    return {"message": f"Hello, {name}!"}

@app.route("/headers")
def headers():
    url = request.headers.get('x-vercel-deployment-url')
    return Response(url, mimetype='text/plain')

@app.route("/query")
def query():
    param = request.args.get('param', default='missing')
    return {"received_param": param}
