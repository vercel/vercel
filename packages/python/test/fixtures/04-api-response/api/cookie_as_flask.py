from flask import Flask, Response
app = Flask(__name__)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    r = Response('wsgi:RANDOMNESS_PLACEHOLDER', mimetype='text/plain')
    r.set_cookie('one', 'first')
    r.set_cookie('two', 'second')
    return r
