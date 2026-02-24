const fs = require('node:fs');
const path = require('node:path');

function parsePyprojectName(pyprojectContent) {
  const projectSectionMatch = pyprojectContent.match(
    /\[project\][\s\S]*?(?:\n\[|$)/
  );
  const projectSection = projectSectionMatch ? projectSectionMatch[0] : '';
  const nameMatch = projectSection.match(/^\s*name\s*=\s*"([^"]+)"/m);
  return nameMatch ? nameMatch[1] : null;
}

function getPythonPackages(rootDir) {
  const pythonRoot = path.join(rootDir, 'python');
  if (!fs.existsSync(pythonRoot)) {
    return [];
  }

  return fs
    .readdirSync(pythonRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const packageDir = entry.name;
      const projectDir = `python/${packageDir}`;
      const pyprojectPath = path.join(rootDir, projectDir, 'pyproject.toml');

      if (!fs.existsSync(pyprojectPath)) {
        return null;
      }

      const pyproject = fs.readFileSync(pyprojectPath, 'utf8');
      const packageName = parsePyprojectName(pyproject);
      if (!packageName) {
        return null;
      }
      const label = toLabel({ packageName, packageDir });
      const title = toTitle(label);

      return {
        packageDir,
        projectDir,
        packageName,
        label,
        title,
        project: projectDir,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.projectDir.localeCompare(b.projectDir));
}

function toLabel({ packageName, packageDir }) {
  if (packageName.startsWith('vercel-')) {
    return packageName.slice('vercel-'.length);
  }
  return packageDir;
}

function toTitle(value) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const packages = getPythonPackages(rootDir);
  process.stdout.write(JSON.stringify(packages));
}

module.exports = {
  getPythonPackages,
};

if (require.main === module) {
  main();
}
