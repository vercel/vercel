from fastapi import FastAPI, Request
from fastapi.responses import Response
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import time

# Custom middleware that adds headers and tracks request processing
class RequestTrackingMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.request_count = 0

    async def dispatch(self, request: Request, call_next):
        # Increment request counter
        self.request_count += 1
        
        # Add custom headers to request
        request.state.middleware_processed = True
        request.state.request_id = f"req-{self.request_count}"
        
        # Process request
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        
        # Add custom headers to response
        response.headers["X-Middleware-Processed"] = "true"
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Process-Time"] = f"{process_time:.4f}"
        response.headers["X-Request-Count"] = str(self.request_count)
        
        return response

# Authentication middleware that checks for API key
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Check for API key in headers for protected routes only
        # Get path from request.url.path (standard FastAPI/Starlette way)
        path = str(request.url.path)
        
        # Only protect routes that explicitly start with /api/protected
        # This should NOT match "/" or any other paths - be very explicit
        if path and path.startswith("/api/protected"):
            api_key = request.headers.get("X-API-Key")
            if api_key != "test-api-key-123":
                return Response(
                    content='{"error": "Unauthorized"}',
                    status_code=401,
                    media_type="application/json"
                )
        
        # For all other paths (including "/"), proceed normally
        response = await call_next(request)
        return response

app = FastAPI()

# Add middlewares to the app
app.add_middleware(RequestTrackingMiddleware)
app.add_middleware(AuthMiddleware)

@app.get("/")
def read_root():
    return {"message": "Hello from FastAPI"}

@app.get("/api/test")
def read_test(request: Request):
    # Access middleware state
    request_id = getattr(request.state, "request_id", "unknown")
    return {
        "message": "API endpoint",
        "request_id": request_id,
        "middleware_processed": getattr(request.state, "middleware_processed", False)
    }

@app.get("/api/users")
def get_users():
    return {"users": ["alice", "bob"]}

@app.get("/api/users/{user_id}")
def get_user(user_id: str):
    return {"user_id": user_id}

@app.get("/api/protected")
def get_protected():
    return {"message": "This is a protected endpoint"}

class Item(BaseModel):
    name: str
    value: int

@app.post("/api/items")
def create_item(item: Item):
    return {"created": item.name, "value": item.value}

# Note: do not mount or read from `public/` here; in production the platform
# serves files in `public/` at the root path (e.g. `/test.txt`).
# The middleware handles static file serving in dev mode.

