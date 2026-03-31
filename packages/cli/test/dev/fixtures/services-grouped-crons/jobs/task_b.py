import json
import os

RESULT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".results")


def run_task_b():
    os.makedirs(RESULT_DIR, exist_ok=True)
    with open(os.path.join(RESULT_DIR, "task_b_result.json"), "w") as f:
        json.dump({"executed": "task_b"}, f)
