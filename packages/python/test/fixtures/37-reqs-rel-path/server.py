from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello, World!"}


@app.get("/api/wheels")
def read_wheels():
    import example_pkg_one
    import example_pkg_two
    return {
        "packages": [
            {"name": "example_pkg_one", "version": example_pkg_one.__version__},
            {"name": "example_pkg_two", "version": example_pkg_two.__version__},
        ]
    }
