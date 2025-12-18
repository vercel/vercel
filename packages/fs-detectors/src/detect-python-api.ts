export interface PythonApiFile {
  path: string;
  route: string;
  type?: 'asgi' | 'wsgi' | 'http_handler' | 'unknown';
}

/**
 * Convert a file path to a route pattern for Starlette.
 *
 * Examples:
 *   api/index.py -> /api
 *   api/users.py -> /api/users
 *   api/users/index.py -> /api/users
 *   api/users/[id].py -> /api/users/{id}
 *   api/posts/[...slug].py -> /api/posts/{slug:path}
 */
export function pathToRoutePattern(filePath: string, baseDir = 'api'): string {
  // Remove base_dir prefix and .py extension
  let relPath = filePath;
  if (relPath.startsWith(baseDir + '/')) {
    relPath = relPath.slice(baseDir.length + 1);
  }
  relPath = relPath.replace(/\.py$/, '');

  // Handle index files
  if (relPath === 'index') {
    relPath = '';
  } else if (relPath.endsWith('/index')) {
    relPath = relPath.slice(0, -6);
  }

  // Convert catch-all [...param] to {param:path}
  relPath = relPath.replace(/\[\.\.\.(\w+)\]/g, '{$1:path}');
  // Convert dynamic [param] to {param}
  relPath = relPath.replace(/\[(\w+)\]/g, '{$1}');

  const route = relPath ? `/${baseDir}/${relPath}` : `/${baseDir}`;
  return route.replace(/\/$/, '') || '/';
}

/**
 * Sort Python API files for proper route precedence.
 * More specific routes (fewer dynamic segments) should come first.
 */
export function sortPythonApiFiles(files: PythonApiFile[]): PythonApiFile[] {
  return [...files].sort((a, b) => {
    // Count dynamic segments
    const dynamicA = (a.route.match(/\{[^}]+\}/g) || []).length;
    const dynamicB = (b.route.match(/\{[^}]+\}/g) || []).length;

    // Fewer dynamic segments = higher priority
    if (dynamicA !== dynamicB) {
      return dynamicA - dynamicB;
    }

    // Catch-all routes should come last
    const catchAllA = a.route.includes(':path}');
    const catchAllB = b.route.includes(':path}');
    if (catchAllA !== catchAllB) {
      return catchAllA ? 1 : -1;
    }

    // More specific paths (more segments) come first
    const segmentsA = a.route.split('/').length;
    const segmentsB = b.route.split('/').length;
    if (segmentsA !== segmentsB) {
      return segmentsB - segmentsA;
    }

    // Alphabetical fallback
    return a.route.localeCompare(b.route);
  });
}

/**
 * Collect all Python API files from the file list.
 */
export function collectPythonApiFiles(files: string[]): PythonApiFile[] {
  const pythonFiles: PythonApiFile[] = [];

  for (const file of files) {
    // Only process .py files in api/
    if (!file.startsWith('api/') || !file.endsWith('.py')) {
      continue;
    }

    // Skip hidden files and directories
    if (file.includes('/.') || file.includes('/_')) {
      continue;
    }

    // Skip __init__.py and __pycache__
    if (file.includes('__init__.py') || file.includes('__pycache__')) {
      continue;
    }

    pythonFiles.push({
      path: file,
      route: pathToRoutePattern(file),
    });
  }

  return sortPythonApiFiles(pythonFiles);
}

/**
 * Check if we should use the consolidated Python builder.
 * Returns true if there are multiple Python files that should be combined.
 */
export function shouldConsolidatePythonApi(files: string[]): boolean {
  const pythonApiFiles = collectPythonApiFiles(files);
  // Only consolidate if there are 2+ Python API files
  return pythonApiFiles.length >= 2;
}
