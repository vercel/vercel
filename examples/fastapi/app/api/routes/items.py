from fastapi import APIRouter, Depends

from app.api.deps import get_timestamp

router = APIRouter(prefix="/items", tags=["items"])


@router.get("/")
def read_items(timestamp: str = Depends(get_timestamp)):
    return {
        "data": [
            {"id": 1, "name": "Sample Item 1", "value": 100},
            {"id": 2, "name": "Sample Item 2", "value": 200},
            {"id": 3, "name": "Sample Item 3", "value": 300},
        ],
        "total": 3,
        "timestamp": timestamp,
    }


@router.get("/{item_id}")
def read_item(item_id: int, timestamp: str = Depends(get_timestamp)):
    return {
        "item": {
            "id": item_id,
            "name": f"Sample Item {item_id}",
            "value": item_id * 100,
        },
        "timestamp": timestamp,
    }
