from flask import Flask
from flask import jsonify

app = Flask(__name__)


@app.get('/api/py')
def api_root():
    return {'message': 'Hello from Flask'}


@app.get('/api/py/ping')
def ping():
    return {'message': 'pong from Flask'}


@app.errorhandler(404)
def not_found(_error):
    return jsonify(detail='404 from Flask'), 404
