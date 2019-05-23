from flask import Flask, Response, __version__
app = Flask(__name__)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    return Response("path=%s" %(path), mimetype='text/html')
