from fastapi import FastAPI, BackgroundTasks
from contextlib import asynccontextmanager
import asyncio
import os
from datetime import datetime
import logging


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up...")
    startup_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    startup_log_content = f"Startup at: {startup_timestamp}\n"
    # Write to /tmp directory
    temp_log_file = "/tmp/startup_log.txt"
    with open(temp_log_file, "w") as f:
        f.write(startup_log_content)
    logger.info(f"Startup log written to {temp_log_file}")
    yield
    logger.info("Shutting down...")


app = FastAPI()


@app.get("/")
def read_root():
    return {"message": "Hello, World!"}


@app.get("/startup-okay")
async def startup_okay():
    """Read the startup log file from /tmp if it exists, otherwise return 'bad'"""
    temp_log_file = "/tmp/startup_log.txt"
    if os.path.exists(temp_log_file):
        with open(temp_log_file, "r") as f:
            content = f.read()
        return {"status": "lifespan ok", "content": content}
    else:
        return {"status": "lifespan failed"}
