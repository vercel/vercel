from flask import Flask, jsonify

# Import dependencies to verify runtime installation works
import numpy as np
import pandas as pd
import scipy
import matplotlib

# Import private package to verify it gets bundled (not runtime installed)
from my_private_pkg import get_info

matplotlib.use("Agg")  # Use non-interactive backend
import matplotlib.pyplot as plt
from PIL import Image

app = Flask(__name__)


@app.get("/")
def check_dependencies():
    """Endpoint to verify all runtime-installed dependencies are working."""
    results = {}

    # Test numpy
    try:
        arr = np.array([1, 2, 3, 4, 5])
        results["numpy"] = {
            "status": "ok",
            "version": np.__version__,
            "test": f"array mean: {arr.mean()}",
        }
    except Exception as e:
        results["numpy"] = {"status": "error", "error": str(e)}

    # Test pandas
    try:
        df = pd.DataFrame({"a": [1, 2, 3], "b": [4, 5, 6]})
        results["pandas"] = {
            "status": "ok",
            "version": pd.__version__,
            "test": f"dataframe shape: {df.shape}",
        }
    except Exception as e:
        results["pandas"] = {"status": "error", "error": str(e)}

    # Test matplotlib
    try:
        results["matplotlib"] = {
            "status": "ok",
            "version": matplotlib.__version__,
            "test": "backend: " + matplotlib.get_backend(),
        }
    except Exception as e:
        results["matplotlib"] = {"status": "error", "error": str(e)}

    # Test pillow
    try:
        img = Image.new("RGB", (10, 10), color="red")
        results["pillow"] = {
            "status": "ok",
            "version": Image.__version__,
            "test": f"created image: {img.size}",
        }
    except Exception as e:
        results["pillow"] = {"status": "error", "error": str(e)}

    # Test scipy
    try:
        from scipy import stats

        # Simple statistical test
        data = [1, 2, 3, 4, 5]
        mean, std = stats.describe(data).mean, stats.describe(data).variance ** 0.5
        results["scipy"] = {
            "status": "ok",
            "version": scipy.__version__,
            "test": f"stats describe: mean={mean:.2f}",
        }
    except Exception as e:
        results["scipy"] = {"status": "error", "error": str(e)}

    # Test private package (should be bundled, not runtime installed)
    try:
        info = get_info()
        results["my_private_pkg"] = {
            "status": "ok",
            "version": info["version"],
            "test": info["message"],
        }
    except Exception as e:
        results["my_private_pkg"] = {"status": "error", "error": str(e)}

    all_ok = all(r.get("status") == "ok" for r in results.values())

    return jsonify({"all_dependencies_ok": all_ok, "dependencies": results})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5001)
