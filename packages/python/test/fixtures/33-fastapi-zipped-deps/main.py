from fastapi import FastAPI
import importlib
from typing import Any, Dict

app = FastAPI()


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
    }

    imports = {k: check_module(v) for k, v in modules.items()}
    contains_check_module_import_error = any(v["imported"] is False for v in imports.values())
    samples, contains_samples_import_error = run_smoke_samples()

    message = "No import errors" if not contains_check_module_import_error and not contains_samples_import_error else "Import errors found"
    return {
        "message": message,
        "imports": imports,
        "samples": samples,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8003, reload=True)
