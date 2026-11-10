# Sparse file to force the large-functions path, proving a custom build
# command (this script) does not disable compileall.
with open("large_blob.bin", "wb") as f:
    f.truncate(300 * 1024 * 1024)
