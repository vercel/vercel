from flask import Flask
app = Flask(__name__)


@app.route('/api/as_flask')
def index():
    return 'flask:RANDOMNESS_PLACEHOLDER'
