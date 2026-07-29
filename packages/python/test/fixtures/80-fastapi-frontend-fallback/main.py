from fastapi import FastAPI

app = FastAPI()


# fallback=None: a miss gets a plain 404 (no fallback file), so the builder must
# emit no CDN fallback route for this mount.
app.frontend("/none", directory="none", fallback=None)

# fallback="auto" with both index.html and 404.html present: resolves to
# 404.html (the runtime checks 404.html first), serving 404 for every miss.
app.frontend("/both", directory="both", fallback="auto")

# fallback="auto" with only index.html: resolves to index.html, served with 200
# for navigation (Accept: text/html) requests.
app.frontend("/spa", directory="spa", fallback="auto")
