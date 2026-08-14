from vercel_runtime._vendor.uvicorn.config import Config
from vercel_runtime._vendor.uvicorn.main import Server, main, run

__version__ = "0.40.0"
__all__ = ["main", "run", "Config", "Server"]
