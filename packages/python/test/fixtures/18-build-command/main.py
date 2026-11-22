from fastapi import FastAPI


app = FastAPI()


@app.get("/")
def read_root():
    with open("build.txt", "r") as f:
        content = f.read()
    return {"message": content}
