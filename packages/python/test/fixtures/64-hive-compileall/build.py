# Create a large, sparse file at build time so the function takes the large
# functions path, where compileall runs. This also proves a custom build
# command (running this script) does not disable compileall. The file is
# sparse, so it costs negligible disk, compresses to almost nothing in the
# bundle, and is never committed to the repo.
with open("large_blob.bin", "wb") as f:
    f.truncate(300 * 1024 * 1024)
