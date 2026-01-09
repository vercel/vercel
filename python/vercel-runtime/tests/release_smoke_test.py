# Perform a basic smoke test on release artifacts

import unittest


class ReleaseSmokeTest(unittest.TestCase):
    """Basic smoke tests for release artifacts."""

    def test_import_vercel_runtime(self):
        """Test that vercel_runtime can be imported successfully."""
        import vercel_runtime  # noqa


if __name__ == "__main__":
    unittest.main(verbosity=2)
