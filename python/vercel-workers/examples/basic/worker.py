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
