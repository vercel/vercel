from fastapi import FastAPI, APIRouter

app = FastAPI()

router = APIRouter(prefix="/fastapi")

@router.get("/")
def read_root():
    return {"message": "fastapi ok"}

@router.get("/bruh")
def read_bruh():
    return {"message": "fastapi bruh ok"}

app.include_router(router)
