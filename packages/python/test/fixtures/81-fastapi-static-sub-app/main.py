from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

# A mounted sub-application that carries its own StaticFiles mount. The sub-app
# is neither a StaticFiles nor a Router, so the builder must recurse into it
# (via its `.router`) to discover the nested mount and serve `/sub/static/*`
# from the CDN.
sub = FastAPI()
sub.mount("/static", StaticFiles(directory="sub_static"), name="static")

app = FastAPI()
app.mount("/sub", sub)
