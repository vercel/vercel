"""vercel-runtime test suite."""

import pathlib
import sys
import unittest
from typing import NoReturn


def discover(pattern: str = "test_*.py") -> unittest.TestSuite:
    """Discover and run tests."""
    test_loader = unittest.TestLoader()
    start_dir = pathlib.Path(__file__).parent
    top_level_dir = start_dir.parent
    test_suite = test_loader.discover(
        start_dir=str(start_dir),
        top_level_dir=str(top_level_dir),
        pattern=pattern,
    )
    return test_suite


def main() -> NoReturn:
    """Run tests."""
    runner = unittest.runner.TextTestRunner(verbosity=2)
    pattern = sys.argv[1] if len(sys.argv) > 1 else "test_*.py"
    result = runner.run(discover(pattern))
    sys.exit(not result.wasSuccessful())


if __name__ == "__main__":
    main()
