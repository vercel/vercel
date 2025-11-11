from flask import Flask, Blueprint

app = Flask(__name__)

bp = Blueprint('main', __name__, url_prefix='/flask')

@bp.route("/")
def index():
    return "flask ok"


@bp.route("/bruh")
def read_bruh():
    return "flask bruh ok"

app.register_blueprint(bp)
