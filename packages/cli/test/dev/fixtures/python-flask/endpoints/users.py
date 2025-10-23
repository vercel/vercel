from flask import Blueprint, jsonify

users_bp = Blueprint('users', __name__, url_prefix='/api')


@users_bp.route('/users')
def list_users():
    return jsonify({
        "users": [
            {"id": 1, "name": "Alice"},
            {"id": 2, "name": "Bob"},
        ]
    })
