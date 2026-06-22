# Create a large, sparse file at build time so the function is large enough that
# compileall would normally run. This proves compileall is skipped here only
# because the fixture uses a custom build command (running this script) — not
# because of size. The file is sparse, so it costs negligible disk, compresses
# to almost nothing in the bundle, and is never committed to the repo.
with open("large_blob.bin", "wb") as f:
    f.truncate(300 * 1024 * 1024)
