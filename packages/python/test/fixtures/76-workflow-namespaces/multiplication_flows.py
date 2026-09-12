from __future__ import annotations

from vercel.cache import get_cache
from vercel.workflow import Workflows

MULTIPLICATION_CACHE_NAMESPACE = "workflow-jobs"

workflows = Workflows(namespace="multiplication")


@workflows.step
async def multiply(x: int, y: int) -> int:
    return x * y


@workflows.step
async def record(request_id: str, product: int) -> None:
    get_cache(namespace=MULTIPLICATION_CACHE_NAMESPACE).set(
        f"multiplication:{request_id}",
        {"requestId": request_id, "product": product},
        options={"ttl": 300},
    )


@workflows.workflow
async def process_job(request_id: str, x: int, y: int) -> int:
    product = await multiply(x, y)
    await record(request_id, product)
    return product
