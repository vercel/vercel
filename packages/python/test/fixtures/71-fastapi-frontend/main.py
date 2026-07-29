from fastapi import FastAPI

app = FastAPI()


# A frontend build served from the CDN. This fixture covers plain file serving;
# fallback varieties (index.html / 404.html / auto / None) live in fixture 80.
app.frontend("/", directory="frontend")
