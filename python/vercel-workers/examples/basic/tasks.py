from __future__ import annotations

import json
from typing import Any

from vercel.workers import MessageMetadata, WorkerTimeoutResult, subscribe


@subscribe(topic="default", consumer="default")
def process_message(message: Any, metadata: MessageMetadata) -> WorkerTimeoutResult | None:
    """
    Basic worker that runs whenever a message is delivered to the "default" queue.

    Returning None acknowledges the message. To request a retry later, you could
    return {"timeoutSeconds": 60}.
    """
    print("Received message from queue:")
    print(json.dumps(message, indent=2, default=str))

    print("Metadata:")
    print(json.dumps(metadata, indent=2, default=str))

    return None


if __name__ == "__main__":
    # Simple manual test: invoke the worker directly with a fake payload.
    example_metadata: MessageMetadata = {
        "messageId": "dev-local",
        "deliveryCount": 1,
        "createdAt": "now",
        "topic": "default",
        "consumer": "default",
    }
    process_message({"message": "hello from local test"}, example_metadata)
