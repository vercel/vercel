from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, TypedDict
from uuid import UUID


class WorkerJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles common Python types not supported by the stdlib."""

    def default(self, o: Any) -> Any:
        match o:
            case UUID():
                return str(o)
            case datetime() | date():
                return o.isoformat()
            case Decimal():
                return float(o)
            case _:
                return super().default(o)


class SendMessageResult(TypedDict):
    """Result of sending a message to the queue.

    ``messageId`` is ``None`` when the server returns 202 (deferred delivery).
    """

    messageId: str | None


class _DeploymentIdUnset:
    pass


DEPLOYMENT_ID_UNSET = _DeploymentIdUnset()
type DeploymentIdOption = str | None | _DeploymentIdUnset


__all__ = [
    "DEPLOYMENT_ID_UNSET",
    "DeploymentIdOption",
    "SendMessageResult",
    "WorkerJSONEncoder",
]
