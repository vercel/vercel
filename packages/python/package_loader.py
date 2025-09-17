from __future__ import annotations

import importlib.abc
import os
import sys
import threading
import zipfile
from pathlib import Path
import shutil
import site
import tempfile
from typing import Optional, Set


class PackageLazyLoader(importlib.abc.MetaPathFinder):
    """
    A meta path finder that lazily extracts modules and packages from
    `_vendor/python/_vendor.zip` to a temporary directory on first import.

    Rationale: Some libraries rely on __file__ or filesystem-relative assets.
    Importing directly from a .zip can break those assumptions. By extracting
    the package/module to a real directory under /tmp (or OS temp dir), we
    preserve those semantics while keeping cold-start size small.
    """

    def __init__(self, vendor_zip_path: Path):
        self.vendor_zip_path = vendor_zip_path
        self.extract_root = Path(tempfile.gettempdir()) / "vendor-lazy-loader" / "python"
        self._lock = threading.Lock()
        self._indexed = False
        self._top_level_packages: Set[str] = set()
        self._top_level_modules: Set[str] = set()
        self._extracted: Set[str] = set()

    def _ensure_index(self) -> None:
        if self._indexed:
            return
        with self._lock:
            if self._indexed:
                return
            if not self.vendor_zip_path.exists():
                self._indexed = True
                return
            with zipfile.ZipFile(self.vendor_zip_path, "r") as zf:
                for name in zf.namelist():
                    if name.endswith("/"):
                        # Directory marker in zip; skip
                        continue
                    # Skip cache and compiled artifacts inside the zip
                    if "/__pycache__/" in name or name.endswith((".pyc", ".pyo")):
                        continue
                    parts = name.split("/")
                    if len(parts) == 1:
                        if name.endswith(".py"):
                            top = name[:-3]
                            self._top_level_modules.add(top)
                    else:
                        # Treat anything with a directory as belonging to a top-level package
                        top = parts[0]
                        # Exclude metadata directories if any accidentally got zipped
                        if top.endswith((".dist-info", ".egg-info", ".data")):
                            continue
                        self._top_level_packages.add(top)
            self._indexed = True

    def _extract_top_level(self, top: str) -> None:
        if top in self._extracted:
            return
        with self._lock:
            if top in self._extracted:
                return
            self.extract_root.mkdir(parents=True, exist_ok=True)
            if not self.vendor_zip_path.exists():
                # Nothing to do
                self._extracted.add(top)
                return
            with zipfile.ZipFile(self.vendor_zip_path, "r") as zf:
                # Determine whether it's a package directory or a single-file module
                has_pkg = any(n.startswith(f"{top}/") for n in zf.namelist())
                has_mod = any(n == f"{top}.py" for n in zf.namelist())

                if has_pkg:
                    prefix = f"{top}/"
                    for member in zf.namelist():
                        if not member.startswith(prefix):
                            continue
                        if member.endswith("/"):
                            # Directory entry
                            (self.extract_root / member).mkdir(parents=True, exist_ok=True)
                            continue
                        if "/__pycache__/" in member or member.endswith((".pyc", ".pyo")):
                            continue
                        target_path = self.extract_root / member
                        target_path.parent.mkdir(parents=True, exist_ok=True)
                        with zf.open(member) as src, open(target_path, "wb") as dst:
                            shutil.copyfileobj(src, dst)
                elif has_mod:
                    member = f"{top}.py"
                    target_path = self.extract_root / member
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(member) as src, open(target_path, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                # else: not present in zip; nothing to extract

            self._extracted.add(top)

    def find_spec(self, fullname: str, path: Optional[object], target: Optional[object] = None):  # type: ignore[override]
        # Only react on top-level package/module
        top = fullname.split(".")[0]
        if top in sys.modules:
            return None

        self._ensure_index()
        # Check if this top-level module/package is available in our vendor zip
        # If not, return None to let other finders handle it (e.g., standard library, site-packages)
        if top not in self._top_level_packages and top not in self._top_level_modules:
            return None

        # Extract the top-level module/package to a temp dir
        self._extract_top_level(top)

        # Ensure temp dir for extracted packages is on sys.path so default finders can load it
        temp_path = str(self.extract_root)
        if temp_path not in sys.path:
            # Prepend to prioritize extracted packages over anything else
            sys.path.insert(0, temp_path)
            # Clear importer cache for this path so it will be scanned
            sys.path_importer_cache.pop(temp_path, None)

        # Return None to continue with the default import machinery (now that files exist)
        return None


_finder: Optional[PackageLazyLoader] = None


def _default_vendor_root() -> Path:
    # Allow override via env var
    env_dir = os.environ.get("LAZY_VENDOR_DIR")
    if env_dir:
        return Path(env_dir)
    # Default to project-local `_vendor/python` relative to this file
    here = Path(__file__).resolve().parent
    return here / "_vendor" / "python"


def enable(vendor_root: Optional[Path | str]) -> None:
    global _finder
    if _finder is not None:
        return

    vendor_root = Path(vendor_root) if isinstance(vendor_root, str) else vendor_root
    vendor_zip = vendor_root / "_vendor-py.zip"

    # Ensure vendor_root is available on sys.path for metadata (dist-info) and any native-extension packages
    vendor_root_str = str(vendor_root)
    if vendor_root.exists() and vendor_root_str not in sys.path:
        # Put vendor site-packages after the temp dir (which we'll add in the finder)
        # but ahead of global site-packages.
        idx = 0
        if sys.path and sys.path[0] in ("", str(Path.cwd())):
            idx = 1
        sys.path.insert(idx, vendor_root_str)
        site.addsitedir(vendor_root_str)

    if not vendor_zip.exists():
        # Nothing to lazily load; fall back to normal imports.
        return

    _finder = PackageLazyLoader(vendor_zip)
    sys.meta_path.insert(0, _finder)


def disable() -> None:
    global _finder
    if _finder is None:
        return
    try:
        sys.meta_path.remove(_finder)
    except ValueError:
        pass
    _finder = None
