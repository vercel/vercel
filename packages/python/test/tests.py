import sys
import os
import unittest

# Add parent directory to path so we can import entrypoint.py
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from entrypoint import has_app_export


class TestHasAppExport(unittest.TestCase):
    """Tests for the has_app_export function."""

    # === POSITIVE CASES: Should detect app export ===

    def test_fastapi_simple_assignment(self):
        """app = FastAPI() should be detected."""
        source = 'from fastapi import FastAPI\napp = FastAPI()\n'
        self.assertTrue(has_app_export(source))

    def test_flask_simple_assignment(self):
        """app = Flask(__name__) should be detected."""
        source = 'from flask import Flask\napp = Flask(__name__)\n'
        self.assertTrue(has_app_export(source))

    def test_annotated_assignment(self):
        """app: FastAPI = FastAPI() should be detected."""
        source = 'from fastapi import FastAPI\napp: FastAPI = FastAPI()\n'
        self.assertTrue(has_app_export(source))

    def test_import_with_alias(self):
        """from server import application as app should be detected."""
        source = 'from server import application as app\n'
        self.assertTrue(has_app_export(source))

    def test_import_app_directly(self):
        """from mymodule import app should be detected."""
        source = 'from mymodule import app\n'
        self.assertTrue(has_app_export(source))

    def test_factory_pattern(self):
        """app = create_app() should be detected."""
        source = 'from myapp import create_app\napp = create_app()\n'
        self.assertTrue(has_app_export(source))

    def test_qualified_call(self):
        """app = fastapi.FastAPI() should be detected."""
        source = 'import fastapi\napp = fastapi.FastAPI()\n'
        self.assertTrue(has_app_export(source))

    def test_with_arguments(self):
        """app = FastAPI(title="My API") should be detected."""
        source = 'from fastapi import FastAPI\napp = FastAPI(title="My API", version="1.0")\n'
        self.assertTrue(has_app_export(source))

    def test_multiline_with_app(self):
        """Should detect app in a file with multiple lines."""
        source = '''
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"hello": "world"}
'''
        self.assertTrue(has_app_export(source))

    # === NEGATIVE CASES: Should NOT detect app export ===

    def test_no_app_variable(self):
        """File without app variable should not be detected."""
        source = 'from fastapi import FastAPI\nserver = FastAPI()\n'
        self.assertFalse(has_app_export(source))

    def test_app_string_literal(self):
        """app = "not an app" should not be detected."""
        source = 'app = "not an app"\n'
        self.assertFalse(has_app_export(source))

    def test_app_number_literal(self):
        """app = 123 should not be detected."""
        source = 'app = 123\n'
        self.assertFalse(has_app_export(source))

    def test_app_annotation_only(self):
        """app: FastAPI (annotation without assignment) should not be detected."""
        source = 'from fastapi import FastAPI\napp: FastAPI\n'
        self.assertFalse(has_app_export(source))

    def test_app_in_comment(self):
        """app mentioned in comment should not be detected."""
        source = '# app = FastAPI()\nserver = FastAPI()\n'
        self.assertFalse(has_app_export(source))

    def test_app_in_string(self):
        """app mentioned in string should not be detected."""
        source = 'message = "app = FastAPI()"\n'
        self.assertFalse(has_app_export(source))

    def test_app_as_dict_key(self):
        """app as dict key should not be detected."""
        source = 'config = {"app": "myapp"}\n'
        self.assertFalse(has_app_export(source))

    def test_empty_source(self):
        """Empty source should not be detected."""
        source = ''
        self.assertFalse(has_app_export(source))

    def test_syntax_error(self):
        """Invalid Python syntax should not crash, return False."""
        source = 'def broken(\n'
        self.assertFalse(has_app_export(source))

    def test_application_variable(self):
        """application = FastAPI() should not be detected (wrong name)."""
        source = 'from fastapi import FastAPI\napplication = FastAPI()\n'
        self.assertFalse(has_app_export(source))

    def test_my_app_variable(self):
        """my_app = FastAPI() should not be detected (wrong name)."""
        source = 'from fastapi import FastAPI\nmy_app = FastAPI()\n'
        self.assertFalse(has_app_export(source))

    def test_app_attribute_access(self):
        """Accessing app attribute should not count as export."""
        source = 'print(server.app)\n'
        self.assertFalse(has_app_export(source))

    def test_app_in_function(self):
        """app defined inside function should not be detected (not module-level)."""
        source = '''
def create():
    app = FastAPI()
    return app
'''
        self.assertFalse(has_app_export(source))

    def test_app_in_class(self):
        """app defined inside class should not be detected."""
        source = '''
class Server:
    app = FastAPI()
'''
        self.assertFalse(has_app_export(source))

    def test_import_something_else_as_app(self):
        """Import of non-app things aliased to app should be detected."""
        # This is actually a positive case - we detect the import alias
        source = 'from utils import helper as app\n'
        self.assertTrue(has_app_export(source))


if __name__ == '__main__':
    # Ignore any extra CLI args that may be forwarded by the JS test runner/CI.
    unittest.main(argv=['tests.py'], verbosity=2)
