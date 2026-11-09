import json
import os
import time
import uuid

REVISION = "A"
attempt = str(uuid.uuid4())

while True:
    print(json.dumps({"revision": REVISION, "attempt": attempt, "pid": os.getpid(), "time": time.time()}), flush=True)
    time.sleep(5)
