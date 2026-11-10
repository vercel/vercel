from fastapi import FastAPI, BackgroundTasks
import asyncio
import os
import logging


logger = logging.getLogger(__name__)
app = FastAPI()


@app.get("/")
def read_root():
    return {"message": "Hello, World!"}


def _token_path(ns: str, token: str) -> str:
    return os.path.join("/tmp/logs", ns, f"bg-{token}")


async def _bg_write_file(ns: str, token: str):
    logger.info(f"[background] Writing file for token: {token}")
    await asyncio.sleep(3)
    path = _token_path(ns, token)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(token)


async def _bg_crash(ns: str, token: str):
    logger.info(f"[background] Crashing for token: {token}")
    await asyncio.sleep(0.5)
    raise Exception(f"Intentional crash for token: {token}")


@app.get("/bg-file")
async def bg_file(ns: str, token: str, background_tasks: BackgroundTasks):
    logger.info(f"Queuing file for token: {token}")
    background_tasks.add_task(_bg_write_file, ns, token)
    return {"status": "queued", "token": token}


@app.get("/bg-files-sequential")
async def bg_files_sequential(ns: str, token: str, count: int, background_tasks: BackgroundTasks):
    logger.info(f"Queuing {count} sequential files for token: {token}")
    for i in range(count):
        background_tasks.add_task(_bg_write_file, ns, f"{token}-{i}")
    return {"status": "queued", "token": token, "count": count}


@app.get("/bg-files-concurrent")
async def bg_files_concurrent(ns: str, token: str, count: int, background_tasks: BackgroundTasks):
    logger.info(f"Queuing {count} concurrent files for token: {token}")
    async def orchestrate():
        await asyncio.gather(*(_bg_write_file(ns, f"{token}-{i}") for i in range(count)))

    background_tasks.add_task(orchestrate)
    return {"status": "queued", "token": token, "count": count}


@app.get("/bg-crash")
async def bg_crash(ns: str, token: str, background_tasks: BackgroundTasks):
    logger.info(f"Queuing crash for token: {token}")
    background_tasks.add_task(_bg_crash, ns, token)
    return {"status": "queued", "token": token}


@app.get("/bg-status")
async def bg_status(ns: str, token: str):
    logger.info(f"Checking status for token: {token}")
    path = _token_path(ns, token)
    try:
        if os.path.exists(path):
            with open(path, "r") as f:
                content = f.read()
            return "true" if token in content else "false"
        return "false"
    except Exception:
        return "false"


@app.get("/bg-logs")
async def bg_logs(ns: str):
    logger.info("Getting background logs")
    log_dir = os.path.join("/tmp/logs", ns)
    if not os.path.exists(log_dir):
        log_files = []
    else:
        log_files = os.listdir(log_dir)
    return {"status": "ok", "log_files": log_files, "count": f"{len(log_files)} log files"}
