from fastapi import FastAPI, BackgroundTasks
import asyncio
import os


app = FastAPI()


@app.get("/")
def read_root():
    return {"message": "Hello, World!"}


def _token_path(token: str) -> str:
    return f"/tmp/fastapi-bg-{token}"


async def _bg_write_file(token: str):
    await asyncio.sleep(0.5)
    path = _token_path(token)
    # Ensure directory exists (should for /tmp, but safe)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(token)


async def _bg_crash(token: str):
    await asyncio.sleep(0.5)
    raise Exception(f"Intentional crash for token: {token}")


@app.get("/bg-file")
async def bg_file(token: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(_bg_write_file, token)
    return {"status": "queued", "token": token}


@app.get("/bg-crash")
async def bg_crash(token: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(_bg_crash, token)
    return {"status": "queued", "token": token}


@app.get("/bg-status")
async def bg_status(token: str):
    path = _token_path(token)
    try:
        if os.path.exists(path):
            with open(path, "r") as f:
                content = f.read()
            return "true" if token in content else "false"
        return "false"
    except Exception:
        return "false"
