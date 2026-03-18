import json
import os

from vercel.workers import subscribe

RESULT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".results")


@subscribe(topic="tasks-topic")
def handle_task(message, metadata):
    os.makedirs(RESULT_DIR, exist_ok=True)
    with open(os.path.join(RESULT_DIR, "worker_exact_result.json"), "w") as f:
        json.dump(
            {
                "received": True,
                "message": message,
                "messageId": metadata.get("messageId", ""),
            },
            f,
        )
