import sys
import ast


def has_app_export(source: str) -> bool:
    try:
        tree = ast.parse(source)
        for node in tree.body:
            # Check assignments: app = Flask(__name__)
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == 'app':
                        # Check if the value is a Call (e.g., Flask(), FastAPI(), create_app())
                        if isinstance(node.value, ast.Call):
                            return True

            # Check annotated assignments: app: FastAPI = FastAPI()
            elif isinstance(node, ast.AnnAssign):
                target = node.target
                if isinstance(target, ast.Name) and target.id == 'app':
                    if isinstance(node.value, ast.Call):
                        return True

            # Check imports with or without alias: from server import application as app
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    imported_name = alias.asname if alias.asname else alias.name
                    if imported_name == 'app':
                        return True

        return False
    except Exception:
        return False


if __name__ == '__main__':
    try:
        source = sys.stdin.read()
    except Exception:
        source = ''
    sys.stdout.write('1' if has_app_export(source) else '0')
