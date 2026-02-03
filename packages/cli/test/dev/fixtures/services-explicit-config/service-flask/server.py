import os
from flask import Blueprint, Flask, jsonify

bp = Blueprint("bp", __name__, url_prefix=os.getenv("VERCEL_SERVICE_ROUTE_PREFIX"))


@bp.route("/")
def root():
    return jsonify(
        {
            "framework": "flask",
            "service": "service-flask",
        }
    )


app = Flask(__name__)
app.register_blueprint(bp)
