# Create a large, sparse file at build time so this function exceeds the
# standard size limit and is built as a large function — which is what triggers
# compileall. The file is sparse, so it costs negligible disk, compresses to
# almost nothing in the bundle, and is never committed to the repo.
with open("large_blob.bin", "wb") as f:
    f.truncate(300 * 1024 * 1024)
