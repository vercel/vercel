from starlette.responses import JSONResponse
from starlette.routing import Route


async def get_sample_data(request):
    return JSONResponse(
        {
            "data": [
                {"id": 1, "name": "Sample Item 1", "value": 100},
                {"id": 2, "name": "Sample Item 2", "value": 200},
                {"id": 3, "name": "Sample Item 3", "value": 300},
            ],
            "total": 3,
            "timestamp": "2024-01-01T00:00:00Z",
        }
    )


async def get_item(request):
    item_id = int(request.path_params["item_id"])
    return JSONResponse(
        {
            "item": {
                "id": item_id,
                "name": f"Sample Item {item_id}",
                "value": item_id * 100,
            },
            "timestamp": "2024-01-01T00:00:00Z",
        }
    )


api_routes = [
    Route("/data", get_sample_data),
    Route("/items/{item_id:int}", get_item),
]
