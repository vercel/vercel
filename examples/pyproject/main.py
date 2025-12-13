from starlette.applications import Starlette
from starlette.responses import PlainTextResponse, JSONResponse
from starlette.routing import Route


async def homepage(request):
    return PlainTextResponse("Hello Starlette!")


async def get_user(request):
    user_id = request.path_params['id']
    return JSONResponse({"id": user_id})


async def get_comment(request):
    post_id = request.path_params['postId']
    comment_id = request.path_params['commentId']
    return JSONResponse({"postId": post_id, "commentId": comment_id})


routes = [
    Route("/", homepage),
    Route("/api/users/{id}", get_user),
    Route("/api/posts/{postId}/comments/{commentId}", get_comment),
]

app = Starlette(routes=routes)
