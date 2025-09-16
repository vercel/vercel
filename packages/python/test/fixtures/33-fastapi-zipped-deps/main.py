from fastapi import FastAPI
import importlib
from typing import Any, Dict
from importlib import resources as ilr
from pathlib import Path
from starlette.staticfiles import StaticFiles
import tempfile
import os

app = FastAPI()

# Serve a static file extracted from a zipped dependency using importlib.resources
try:
    import fastapi as _dep_pkg_for_static
    _static_dir = os.path.join(tempfile.gettempdir(), "fastapi_static")
    os.makedirs(_static_dir, exist_ok=True)
    _content = ilr.files(_dep_pkg_for_static.__name__).joinpath("__init__.py").read_text()
    with open(os.path.join(_static_dir, "fastapi_init.py"), "w", encoding="utf-8") as f:
        f.write(_content)
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")
except Exception:
    # If this fails, the resource_access sample below will surface an error
    pass


def check_module(module_name: str) -> Dict[str, Any]:
    try:
        mod = importlib.import_module(module_name)
        info: Dict[str, Any] = {"imported": True}
        version = getattr(mod, "__version__", None)
        if version is not None:
            info["version"] = str(version)
        return info
    except Exception as exc:  # noqa: BLE001 - surface raw import error for smoke screen
        return {"imported": False, "error": f"{exc.__class__.__name__}: {exc}"}


def run_smoke_samples() -> Dict[str, Any]:
    results: Dict[str, Any] = {}

    contains_import_error = False

    # pydantic sample
    try:
        from pydantic import BaseModel

        class Greeting(BaseModel):
            message: str = "hi"

        try:
            payload = Greeting().model_dump()  # pydantic v2
        except AttributeError:  # pydantic v1 fallback
            payload = Greeting().dict()
        results["pydantic_sample"] = {"ok": True, "value": payload}
    except Exception as exc:
        contains_import_error = True
        results["pydantic_sample"] = {"ok": False, "error": str(exc)}

    # pyyaml sample
    try:
        import yaml

        dumped = yaml.safe_dump({"a": 1}).strip()
        results["yaml_sample"] = {"ok": True, "value": dumped}
    except Exception as exc:
        contains_import_error = True
        results["yaml_sample"] = {"ok": False, "error": str(exc)}

    # PyJWT sample
    try:
        import jwt

        token = jwt.encode({"x": 1}, "secret", algorithm="HS256")
        _ = jwt.decode(token, "secret", algorithms=["HS256"])  # noqa: F841
        results["pyjwt_sample"] = {"ok": True}
    except Exception as exc:
        contains_import_error = True
        results["pyjwt_sample"] = {"ok": False, "error": str(exc)}

    # SQLAlchemy sample (in-memory SQLite)
    try:
        from sqlalchemy import create_engine

        engine = create_engine("sqlite:///:memory:")
        connection = engine.connect()
        connection.close()
        engine.dispose()
        results["sqlalchemy_sample"] = {"ok": True}
    except Exception as exc:
        contains_import_error = True
        results["sqlalchemy_sample"] = {"ok": False, "error": str(exc)}

    # httpx sample
    try:
        import httpx

        client = httpx.Client()
        client.close()
        results["httpx_sample"] = {"ok": True}
    except Exception as exc:
        contains_import_error = True
        results["httpx_sample"] = {"ok": False, "error": str(exc)}

    # requests sample
    try:
        import requests

        session = requests.Session()
        session.close()
        results["requests_sample"] = {"ok": True}
    except Exception as exc:
        contains_import_error = True
        results["requests_sample"] = {"ok": False, "error": str(exc)}

    # numpy sample
    try:
        import numpy as np
        np.array([1, 2, 3])
        np.sum([1, 2, 3])
        np.mean([1, 2, 3])
        np.std([1, 2, 3])
        np.var([1, 2, 3])
        np.median([1, 2, 3])
        np.min([1, 2, 3])
        np.max([1, 2, 3])
        np.random.rand(10)
        np.random.randn(10)
        np.random.randint(10)
        np.random.randint(10, size=(3, 4))
        np.random.randint(10, size=(3, 4), dtype=np.uint8)
        np.random.randint(10, size=(3, 4), dtype=np.uint8)
        results["numpy_sample"] = {"ok": True}
    except Exception as exc:
        contains_import_error = True
        results["numpy_sample"] = {"ok": False, "error": str(exc)}

    # importlib.resources vs naive path access for a zipped dependency (fastapi)
    try:
        import fastapi as dep_pkg

        res_info: Dict[str, Any] = {}
        try:
            data = ilr.files(dep_pkg.__name__).joinpath("__init__.py").read_text()
            res_info["importlib_resources_ok"] = isinstance(data, str) and len(data) > 0
        except Exception as exc:
            res_info["importlib_resources_ok"] = False
            res_info["importlib_resources_error"] = f"{exc.__class__.__name__}: {exc}"

        try:
            p = Path(dep_pkg.__file__).parent / "__init__.py"
            _ = p.read_text(encoding="utf-8")
            res_info["naive_path_open_ok"] = True
        except Exception as exc:
            # Expected to fail when dependency is zipped
            res_info["naive_path_open_ok"] = False
            res_info["naive_path_open_error"] = f"{exc.__class__.__name__}: {exc}"

        results["resource_access"] = res_info
    except Exception as exc:
        results["resource_access"] = {
            "importlib_resources_ok": False,
            "naive_path_open_ok": False,
            "setup_error": f"{exc.__class__.__name__}: {exc}",
        }

    return results, contains_import_error


@app.get("/")
def read_root():
    modules = {
        "fastapi": "fastapi",
        "pydantic": "pydantic",
        "pydantic-settings": "pydantic_settings",
        "python-dotenv": "dotenv",
        "httpx": "httpx",
        "requests": "requests",
        "pyyaml": "yaml",
        "bcrypt": "bcrypt",
        "PyJWT": "jwt",
        "supabase": "supabase",
        "openai": "openai",
        "anthropic": "anthropic",
        "cohere": "cohere",
        "mistralai": "mistralai",
        "openai-agents": "agents",
        "langchain": "langchain",
        "langchain-community": "langchain_community",
        "pinecone": "pinecone",
        "posthog": "posthog",
        "resend": "resend",
        "exa-py": "exa_py",
        "redis": "redis",
        "uvicorn": "uvicorn",
        "numpy": "numpy",
    }

    imports = {k: check_module(v) for k, v in modules.items()}
    contains_check_module_import_error = any(v["imported"] is False for v in imports.values())
    samples, contains_samples_import_error = run_smoke_samples()

    message = "No import errors" if not contains_check_module_import_error and not contains_samples_import_error else "Import errors found"
    if samples.get("resource_access", {}).get("importlib_resources_ok"):
        message += " (Resources OK)"

    # Additional end-to-end checks targeting zipimport-sensitive behaviors
    extra_tokens = []
    try:
        from importlib import metadata as im  # type: ignore
        v = im.version("fastapi")
        extra_tokens.append("metadata-version-ok:ok" if isinstance(v, str) and len(v) > 0 else "metadata-version-ok:fail")
    except Exception:
        extra_tokens.append("metadata-version-ok:fail")

    try:
        import pkg_resources  # type: ignore
        v2 = pkg_resources.get_distribution("fastapi").version
        extra_tokens.append("pkg-resources-version-ok:ok" if isinstance(v2, str) and len(v2) > 0 else "pkg-resources-version-ok:fail")
    except Exception:
        extra_tokens.append("pkg-resources-version-ok:fail")

    try:
        import pkg_resources  # type: ignore
        import os as _os
        p = pkg_resources.resource_filename("fastapi", "__init__.py")
        ok = isinstance(p, str) and _os.path.isfile(p)
        if ok:
            with open(p, "rb") as f:
                _ = f.read(1)
        extra_tokens.append("resource-filename-works:ok" if ok else "resource-filename-works:fail")
    except Exception:
        extra_tokens.append("resource-filename-works:fail")

    try:
        import pkg_resources  # type: ignore
        data = pkg_resources.resource_stream("fastapi", "__init__.py").read(16)
        ok = isinstance(data, (bytes, bytearray)) and len(data) > 0
        extra_tokens.append("resource-stream-works:ok" if ok else "resource-stream-works:fail")
    except Exception:
        extra_tokens.append("resource-stream-works:fail")

    try:
        from importlib import resources as _ilr  # type: ignore
        with _ilr.as_file(_ilr.files("fastapi").joinpath("__init__.py")) as p:
            with open(p, "r", encoding="utf-8") as f:
                s = f.read()
        ok = isinstance(s, str) and len(s) > 0
        extra_tokens.append("as-file-works:ok" if ok else "as-file-works:fail")
    except Exception:
        extra_tokens.append("as-file-works:fail")

    try:
        from importlib import resources as _ilr  # type: ignore
        entries = list(_ilr.files("fastapi").iterdir())
        ok = len(entries) > 0
        extra_tokens.append("resources-listing-ok:ok" if ok else "resources-listing-ok:fail")
    except Exception:
        extra_tokens.append("resources-listing-ok:fail")

    try:
        import certifi  # type: ignore
        import os as _os
        cp = certifi.where()
        ok = isinstance(cp, str) and _os.path.isfile(cp)
        if ok:
            with open(cp, "rb") as f:
                _ = f.read(1)
        extra_tokens.append("certifi-file-ok:ok" if ok else "certifi-file-ok:fail")
    except Exception:
        extra_tokens.append("certifi-file-ok:fail")

    try:
        import sys as _sys
        ok = any(str(x).endswith("_vendor-py.zip") for x in _sys.path)
        extra_tokens.append("vendor-zip-in-sys-path:ok" if ok else "vendor-zip-in-sys-path:fail")
    except Exception:
        extra_tokens.append("vendor-zip-in-sys-path:fail")

    if extra_tokens:
        message += ";" + ";".join(extra_tokens)
    return {
        "message": message,
        "imports": imports,
        "samples": samples,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8003, reload=True)
