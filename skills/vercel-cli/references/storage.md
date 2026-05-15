# Blob Storage

`vercel blob` manages Vercel Blob storage — simple file storage for uploading, listing, and deleting files.

```bash
vercel blob put ./image.png                              # upload
vercel blob put ./image.png --pathname images/photo.png  # custom path
vercel blob put ./large.zip --multipart                  # large files
vercel blob list                                         # list blobs
vercel blob list --prefix images/                        # filter by prefix
vercel blob del <url-or-pathname>                        # delete
vercel blob copy <from-url> <to-pathname>                # copy
```

## Store Management

```bash
vercel blob create-store my-store --access private     # create a new store
vercel blob get-store <store-id>                       # show store details
vercel blob delete-store <store-id> --yes              # remove a store
vercel blob empty-store --yes                          # delete all blobs in the selected store
vercel blob list-stores --all --json                   # list stores
```
