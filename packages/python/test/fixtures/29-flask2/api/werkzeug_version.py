import werkzeug
from flask import Flask
app = Flask(__name__)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def main(path):
    return werkzeug.__version__

if __name__ == '__main__':
    app.run(debug=True, port=8002)
