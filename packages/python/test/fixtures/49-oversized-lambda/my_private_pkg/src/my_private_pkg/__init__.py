__version__ = "1.0.0"
PACKAGE_NAME = "my-private-pkg"


def get_info():
    """Return information about this private package."""
    return {
        "name": PACKAGE_NAME,
        "version": __version__,
        "message": "Hello from private package!",
    }
