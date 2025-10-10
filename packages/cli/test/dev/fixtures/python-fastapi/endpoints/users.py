from fastapi import APIRouter

router = APIRouter(prefix="/api")


@router.get("/users")
def list_users():
    return {
        "users": [
            {"id": 1, "name": "Alice"},
            {"id": 2, "name": "Bob"},
        ]
    }
