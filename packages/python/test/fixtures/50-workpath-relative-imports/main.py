from fastapi import FastAPI

from .utils import IMPORT_MARKER, build_message

app = FastAPI()


@app.get("/")
def read_root():
    return {
        "ok": True,
        "import_marker": IMPORT_MARKER,
        "message": build_message("world"),
        "module": __name__,
        "package": __package__,
    }


@app.get("/api/relative/{name}")
def read_relative(name: str):
    return {
        "ok": True,
        "import_marker": IMPORT_MARKER,
        "message": build_message(name),
        "module": __name__,
        "package": __package__,
    }
