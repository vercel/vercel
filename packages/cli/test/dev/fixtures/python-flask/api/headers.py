from flask import Flask, Response, request
app = Flask(__name__)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def headers(path):
    url = request.headers.get('x-vercel-deployment-url')
    return Response(url, mimetype='text/plain')
