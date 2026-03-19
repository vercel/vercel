# Auto-generated trampoline used by vercel dev (Python, ASGI/WSGI)

import os

os.environ.update(
    {
        "VERCEL_DEV_MODULE_NAME": "__VC_DEV_MODULE_NAME__",
        "VERCEL_DEV_ENTRY_ABS": "__VC_DEV_ENTRY_ABS__",
        "VERCEL_DEV_FRAMEWORK": "__VC_DEV_FRAMEWORK__",
        "VERCEL_DEV_VARIABLE_NAME": "__VC_DEV_VARIABLE_NAME__",
    }
)

from vercel_runtime.dev import main  # noqa: E402

if __name__ == "__main__":
    main()
