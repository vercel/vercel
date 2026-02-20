---
'@vercel/python-runtime': minor
'@vercel/python': minor
---

When detecting entrypoints for django:
- First try to get the settings module from manage.py and get the entrypoint from WSGI_APPLICATION.
- Fallback to looking for the assignment of `app`, `application`, or `handler` if that fails
- Include all root dirs in this search.
