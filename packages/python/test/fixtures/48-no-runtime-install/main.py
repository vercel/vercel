from pathlib import Path

import matplotlib
import numpy
import pandas
import scipy
import sklearn
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def index():
    return {
        "ok": True,
        "runtime_install": Path("/tmp/_vc_deps").exists(),
        "versions": {
            "matplotlib": matplotlib.__version__,
            "numpy": numpy.__version__,
            "pandas": pandas.__version__,
            "scipy": scipy.__version__,
            "sklearn": sklearn.__version__,
        },
    }
