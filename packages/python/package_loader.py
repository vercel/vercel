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
from typing import Optional, Set, List
import ctypes


def ensure_ld_library_path(lib_dirs):
    try:
        import sys as _sys
        import os as _os
    except Exception:
        return
    if not _sys.platform.startswith("linux"):
        return
    if not lib_dirs:
        return
    existing = _os.environ.get("LD_LIBRARY_PATH", "")
    parts = [p for p in existing.split(":") if p]
    changed = False
    for d in lib_dirs:
        if d and d not in parts:
            parts.insert(0, d)
            changed = True
    if changed:
        _os.environ["LD_LIBRARY_PATH"] = ":".join(parts)


def preload_shared_libraries(lib_dirs):
    try:
        _is_linux = sys.platform.startswith("linux")
    except Exception:
        _is_linux = False
    if not _is_linux:
        return
    original_flags = None
    try:
        original_flags = sys.getdlopenflags()
        sys.setdlopenflags(original_flags | getattr(ctypes, "RTLD_GLOBAL", 0))
    except Exception:
        original_flags = None
    for d in lib_dirs or []:
        try:
            p = Path(d)
            if not p.is_dir():
                continue
            for so in sorted(p.glob("*.so*")):
                try:
                    ctypes.CDLL(str(so), mode=getattr(ctypes, "RTLD_GLOBAL", None))
                except Exception:
                    pass
        except Exception:
            pass
    if original_flags is not None:
        try:
            sys.setdlopenflags(original_flags)
        except Exception:
            pass


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
        self._lib_dirs_added: Set[str] = set()

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

                # Additionally extract native dependency directories commonly used by manylinux wheels,
                # such as "<pkg>.libs/" at the site-packages root, or "<pkg>/.libs/" inside the package.
                # This is required for packages like numpy, scipy, pyarrow, pandas, etc.
                # Be permissive for variants like "sklearn-cp39.libs/" but do NOT extract arbitrary dot-directories.
                names = zf.namelist()
                lib_prefixes = set()
                # In-package pattern
                lib_prefixes.add(f"{top}/.libs/")
                # Root-level patterns like "<top>.libs/" or "<top>-something.libs/"
                for entry in names:
                    # Only consider top-level directories of the form "name/"
                    if not entry.endswith("/"):
                        continue
                    if entry.count("/") != 1:
                        continue
                    base = entry[:-1]
                    if base.endswith(".libs"):
                        lib_prefixes.add(entry)

                # Track absolute lib directories we extract to add into LD_LIBRARY_PATH
                extracted_lib_dirs = []
                for lib_prefix in lib_prefixes:
                    if any(n.startswith(lib_prefix) for n in names):
                        for member in names:
                            if not member.startswith(lib_prefix):
                                continue
                            if member.endswith("/"):
                                (self.extract_root / member).mkdir(parents=True, exist_ok=True)
                                continue
                            # Do not skip binary files; copy as-is
                            target_path = self.extract_root / member
                            target_path.parent.mkdir(parents=True, exist_ok=True)
                            with zf.open(member) as src, open(target_path, "wb") as dst:
                                shutil.copyfileobj(src, dst)
                        # Record the extracted lib directory absolute path
                        extracted_lib_dirs.append(str(self.extract_root / lib_prefix))

            self._extracted.add(top)

            # Ensure the dynamic linker can find vendored shared libs (Linux)
            ensure_ld_library_path(extracted_lib_dirs)
            # And proactively preload them so C-extensions can resolve symbols
            preload_shared_libraries(extracted_lib_dirs)

    def _pre_extract_lib_dirs(self) -> None:
        # Extract all top-level "*.libs/" and any "*/.libs/" directories in advance
        # so that dependent native libraries are present before any extension loads.
        if not self.vendor_zip_path.exists():
            return
        self.extract_root.mkdir(parents=True, exist_ok=True)
        try:
            with zipfile.ZipFile(self.vendor_zip_path, "r") as zf:
                names = zf.namelist()
                prefixes = set()
                for entry in names:
                    if not entry.endswith("/"):
                        continue
                    # Top-level *.libs/
                    if entry.count("/") == 1 and entry[:-1].endswith(".libs"):
                        prefixes.add(entry)
                    # Any in-package .libs/ directory
                    if "/.libs/" in entry:
                        # Normalize to the path up to and including ".libs/"
                        idx = entry.find("/.libs/")
                        prefixes.add(entry[: idx + len("/.libs/")])

                extracted_dirs = []
                for prefix in prefixes:
                    for member in names:
                        if not member.startswith(prefix):
                            continue
                        if member.endswith("/"):
                            (self.extract_root / member).mkdir(parents=True, exist_ok=True)
                            continue
                        target_path = self.extract_root / member
                        target_path.parent.mkdir(parents=True, exist_ok=True)
                        with zf.open(member) as src, open(target_path, "wb") as dst:
                            shutil.copyfileobj(src, dst)
                    extracted_dirs.append(str(self.extract_root / prefix))
        except Exception:
            return
        # Add to LD_LIBRARY_PATH for early availability
        ensure_ld_library_path(extracted_dirs)
        # Also proactively dlopen the shared libraries so the dynamic linker can
        # resolve DT_NEEDED deps for extension modules imported later.
        preload_shared_libraries(extracted_dirs)

    def _ensure_ld_library_path(self, lib_dirs):
        # Backward-compatible wrapper
        ensure_ld_library_path([d for d in lib_dirs if d not in self._lib_dirs_added])
        for d in lib_dirs:
            self._lib_dirs_added.add(d)

    def _preload_shared_libraries(self, lib_dirs):
        # Backward-compatible wrapper
        preload_shared_libraries(lib_dirs)

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


def enable(vendor_root: Path | str) -> None:
    global _finder
    if _finder is not None:
        return

    vendor_root = Path(vendor_root) if isinstance(vendor_root, str) else vendor_root
    vendor_zip = vendor_root / "_vendor-py.zip"
    native_zip = vendor_root / "_vendor-native.zip"

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

    # Pre-extract native zip if present so native extensions and their libs are available early
    if native_zip.exists():
        extract_root = Path(tempfile.gettempdir()) / "vendor-lazy-loader" / "python"
        extract_root.mkdir(parents=True, exist_ok=True)
        extracted_lib_dirs: List[str] = []
        try:
            with zipfile.ZipFile(native_zip, "r") as zf:
                names = zf.namelist()
                lib_dir_prefixes = set()
                for name in names:
                    if name.endswith("/"):
                        # Track any *.libs/ directories for linker config
                        if name.count("/") == 1 and name[:-1].endswith(".libs"):
                            lib_dir_prefixes.add(name)
                        if "/.libs/" in name:
                            idx = name.find("/.libs/")
                            lib_dir_prefixes.add(name[: idx + len("/.libs/")])
                        (extract_root / name).mkdir(parents=True, exist_ok=True)
                        continue
                    # Skip caches and compiled pyc
                    if "/__pycache__/" in name or name.endswith((".pyc", ".pyo")):
                        continue
                    target_path = extract_root / name
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(name) as src, open(target_path, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                for prefix in lib_dir_prefixes:
                    extracted_lib_dirs.append(str(extract_root / prefix))
        except Exception:
            # Best-effort; if extraction fails, continue without native zip
            pass
        # Make sure these lib directories are available to the dynamic linker
        ensure_ld_library_path(extracted_lib_dirs)
        preload_shared_libraries(extracted_lib_dirs)
        # Ensure extracted path is importable
        temp_path = str(extract_root)
        if temp_path not in sys.path:
            sys.path.insert(0, temp_path)
            sys.path_importer_cache.pop(temp_path, None)

    if not vendor_zip.exists():
        # No pure-Python zip; nothing to lazily load.
        return

    _finder = PackageLazyLoader(vendor_zip)
    # Pre-extract all *.libs directories so the dynamic linker can resolve DT_NEEDED before imports
    _finder._pre_extract_lib_dirs()
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
