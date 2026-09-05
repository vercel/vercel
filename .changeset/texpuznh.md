---
"vercel": patch
---

fix(cli): fix vercel env pull adding duplicate .gitignore rules on Windows (#17556)

The addToGitIgnore function incorrectly detected line endings by checking
if \r\n appeared anywhere in the file, causing CRLF line endings in
comments to be detected even when the file was LF-terminated. The fix
uses a dominant-EOL heuristic to correctly detect the file's line ending
style and uses a simple substring check for duplicate detection.
