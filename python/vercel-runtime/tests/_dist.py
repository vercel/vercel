"""Package distribution utilities."""

from __future__ import annotations

import dataclasses
import functools
import importlib.metadata
import json
import os
import pathlib
import urllib.parse
from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from collections.abc import Sequence


@dataclasses.dataclass(kw_only=True, frozen=True)
class DirectURLOrigin:
    url: str
    editable: bool = False
    commit_id: str | None = None


@functools.cache
def get_direct_url_origin(
    dist_name: str,
    path: Sequence[str] | None = None,
) -> DirectURLOrigin | None:
    """Return PEP 660 Direct URL Origin metadata for package if present."""
    if path is not None:
        dists = importlib.metadata.distributions(name=dist_name, path=[*path])
    else:
        dists = importlib.metadata.distributions(name=dist_name)

    # Distribution finder will return a Distribution for
    # each matching distribution in sys.path even if they're
    # duplicate.  We try them in order until we find one that
    # has direct_url.json in it.
    for dist in dists:
        url_origin = _get_direct_url_origin(dist)
        if url_origin is not None:
            return url_origin

    return None


def _get_direct_url_origin(
    dist: importlib.metadata.Distribution,
) -> DirectURLOrigin | None:
    try:
        data = dist.read_text("direct_url.json")
    except OSError:
        return None
    if data is None:
        return None
    try:
        info = json.loads(data)
    except ValueError:
        return None
    if not isinstance(info, dict):
        return None

    info = cast("dict[str, Any]", info)
    url = info.get("url")
    if not url:
        # URL must be present, metadata is corrupt
        return None

    dir_info = info.get("dir_info")
    if isinstance(dir_info, dict):
        dir_info = cast("dict[str, Any]", dir_info)
        editable = dir_info.get("editable", False)
    else:
        editable = False
    vcs_info = info.get("vcs_info")
    if isinstance(vcs_info, dict):
        vcs_info = cast("dict[str, Any]", vcs_info)
        commit_id = vcs_info.get("commit_id")
    else:
        commit_id = None

    return DirectURLOrigin(
        url=url,
        editable=editable,
        commit_id=commit_id,
    )


def get_origin_source_dir(dist_name: str) -> pathlib.Path | None:
    url_origin = get_direct_url_origin(dist_name)
    if url_origin is None:
        return None

    try:
        dir_url = urllib.parse.urlparse(url_origin.url)
    except ValueError:
        return None

    if dir_url.scheme != "file":
        # Non-local URL?
        return None

    if not dir_url.path:
        # No path?
        return None

    path = pathlib.Path(dir_url.path)
    if not path.is_dir():
        # Not a directory (wheel?)
        return None

    return path


@functools.cache
def get_project_source_root() -> pathlib.Path | None:
    return get_origin_source_dir("vercel_runtime")


def find_project_root() -> pathlib.Path:
    """Find the vercel-runtime project root directory."""
    if gh_checkout := os.environ.get("GITHUB_WORKSPACE"):
        return pathlib.Path(gh_checkout) / "python" / "vercel-runtime"
    elif src_root := get_project_source_root():
        return src_root
    else:
        return pathlib.Path(__file__).parent.parent


PROJECT_ROOT = find_project_root()
