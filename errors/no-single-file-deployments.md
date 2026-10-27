# Single File Deployments

Current versions of Vercel CLI support deploying a single regular file with
`vercel <file>` or `vercel deploy <file>`. Only the selected file is uploaded,
under its original filename. Project linking uses the file's parent directory.
Single-file deployments use static settings and do not apply local build configuration.

If your CLI reports that single-file deployments have been removed, upgrade to a
version that includes restored support, or place the file in its own directory
and deploy that directory.

The `--prebuilt`, `--archive`, and `--local-config` options require a directory.
Temporary deployments (`--temporary` without logging in) support a single file
only when it is an `.html` file.
Symbolic links and special files cannot be used as deployment paths.

The deployed file is publicly accessible. Files excluded by `.vercelignore` or
the default ignore list (such as `.env.local`) cannot be deployed, and hidden
files (such as `.env`) require confirmation or `--yes`.
