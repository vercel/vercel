import importlib.util
import os
import pathlib
import subprocess
import sys
import unittest

PROJECT_ROOT = pathlib.Path(__file__).parent.parent


class TestLint(unittest.TestCase):
    def test_cqa_ruff_lint_check(self):
        if not importlib.util.find_spec("ruff"):
            raise unittest.SkipTest("ruff is not installed") from None

        try:
            subprocess.run(
                [sys.executable, "-m", "ruff", "check"],
                check=True,
                capture_output=True,
                cwd=PROJECT_ROOT,
            )
        except subprocess.CalledProcessError as ex:
            output = ex.stdout.decode()
            if ex.stderr:
                output += "\n\n" + ex.stderr.decode()
            raise AssertionError(f"ruff validation failed:\n{output}") from None

    def test_cqa_ruff_format_check(self):
        if not importlib.util.find_spec("ruff"):
            raise unittest.SkipTest("ruff is not installed") from None

        try:
            subprocess.run(
                [sys.executable, "-m", "ruff", "format", "--check", "."],
                check=True,
                capture_output=True,
                cwd=PROJECT_ROOT,
            )
        except subprocess.CalledProcessError as ex:
            output = ex.stdout.decode()
            if ex.stderr:
                output += "\n\n" + ex.stderr.decode()
            raise AssertionError(f"ruff format validation failed:\n{output}") from None

    @unittest.skip("disabled for now")
    def test_cqa_mypy(self):
        config_path = PROJECT_ROOT / "pyproject.toml"
        if not os.path.exists(config_path):
            raise RuntimeError("could not locate pyproject.toml file")

        if not importlib.util.find_spec("mypy"):
            raise unittest.SkipTest("mypy is not installed") from None

        try:
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "mypy",
                    "--config-file",
                    config_path,
                ],
                check=True,
                capture_output=True,
                cwd=PROJECT_ROOT,
            )
        except subprocess.CalledProcessError as ex:
            output = ex.stdout.decode()
            if ex.stderr:
                output += "\n\n" + ex.stderr.decode()
            raise AssertionError(f"mypy validation failed:\n{output}") from None

    @unittest.skip("disabled for now")
    def test_cqa_pyright(self):
        config_path = PROJECT_ROOT / "pyproject.toml"
        if not os.path.exists(config_path):
            raise RuntimeError("could not locate pyproject.toml file")

        if not importlib.util.find_spec("basedpyright"):
            raise unittest.SkipTest("basedpyright is not installed") from None

        try:
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pyright",
                ],
                check=True,
                capture_output=True,
                cwd=PROJECT_ROOT,
                env=os.environ
                | {
                    # Suppress pyright-python's complaints about new
                    # pyright versions being available.
                    "PYRIGHT_PYTHON_IGNORE_WARNINGS": "1",
                },
            )
        except subprocess.CalledProcessError as ex:
            output = ex.stdout.decode()
            if ex.stderr:
                output += "\n\n" + ex.stderr.decode()
            raise AssertionError(f"pyright validation failed:\n{output}") from None


if __name__ == "__main__":
    unittest.main(verbosity=2)
