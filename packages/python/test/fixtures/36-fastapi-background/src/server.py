from fastapi import FastAPI, BackgroundTasks
import asyncio


app = FastAPI()


@app.get("/")
def read_root():
    return {"message": "Hello, World!"}


async def _bg_work(token: str):
    # simulate async work after response is sent (dev early-flush)
    await asyncio.sleep(0.3)
    print(f"BG-DONE {token}")


@app.get("/bg")
async def trigger_bg(token: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(_bg_work, token)
    return {"status": "queued", "token": token}


async def _bg_crash(token: str):
    # quick log marker, then raise to produce an error trace in logs
    await asyncio.sleep(0.1)
    print(f"BG-CRASH {token}")
    raise RuntimeError("bg crash")


@app.get("/bg-crash")
async def trigger_bg_crash(token: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(_bg_crash, token)
    return {"status": "queued", "token": token, "mode": "crash"}


