---
"vercel": minor
---

Add blob subcommand

These are the new API's:
`vc blob store add mystore` - creates a new blob store, asks to connect store to project and suggests pulling the new env var
`vc blob store rm store_mystoreid` - delete a blob store

All of the following commands will try to read the `BLOB_READ_WRITE_TOKEN` from the next `.env.local` file:
`vc blob put file.txt` - uploads the file from the path to the blob store
`vc blob ls` - list blobs in the store
`vc blob del path/ path2/` - delete blobs from the store
`vc blob copy fromUrl toPathname` - copies a file within the store
