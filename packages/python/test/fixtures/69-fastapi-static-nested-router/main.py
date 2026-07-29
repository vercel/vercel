from fastapi import APIRouter, FastAPI

app = FastAPI()

nested_router = APIRouter()
nested_router.frontend("/", directory="nested_frontend")
app.include_router(nested_router, prefix="/nested")
