from __future__ import annotations

from vercel.cache import get_cache
from vercel.workflow import Workflows

CACHE_NAMESPACE = "workflow-jobs"

# Workflow entrypoint ("flows:workflows"). Constructing the registry hooks the
# workflow and step queue handlers into the Lambda built from
# [tool.vercel.workflows] in pyproject.toml.
workflows = Workflows()


@workflows.step
async def add(x: int, y: int) -> int:
    return x + y


@workflows.step
async def record(request_id: str, total: int) -> None:
    # Record the result in the runtime cache so the web function can observe
    # that the workflow ran to completion.
    get_cache(namespace=CACHE_NAMESPACE).set(
        request_id,
        {"requestId": request_id, "sum": total},
        options={"ttl": 300},
    )


@workflows.workflow
async def process_job(request_id: str, x: int, y: int) -> int:
    total = await add(x, y)
    await record(request_id, total)
    return total
