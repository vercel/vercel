from flask import Flask, jsonify
import simplejson

app = Flask(__name__)


@app.get("/")
def check_dependencies():
    # simplejson is force-bundled (no compatible wheel for cp314)
    try:
        encoded = simplejson.dumps({"key": "value"})
        result = {"status": "ok", "version": simplejson.__version__}
    except Exception as e:
        result = {"status": "error", "error": str(e)}

    return jsonify({"all_dependencies_ok": result["status"] == "ok", "simplejson": result})
