import json
import os

RESULT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".results")


def run_cron_task():
    os.makedirs(RESULT_DIR, exist_ok=True)
    with open(os.path.join(RESULT_DIR, "cron_result.json"), "w") as f:
        json.dump({"executed": True}, f)
