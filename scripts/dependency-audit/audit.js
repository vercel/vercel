#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cliPath = path.join(__dirname, '../../packages/cli');

const pkgJson = require(path.join(cliPath, 'package.json'));

const allDeps = {
  ...pkgJson.dependencies,
  ...pkgJson.devDependencies
};

const packageSizes = {};
const packageLicenses = {};
const deprecatedPackages = [];
const duplicateVersions = {};

try {
  const sizeOutput = execSync('du -sh node_modules/* | sort -hr', { cwd: cliPath }).toString();
  sizeOutput.split('\n').forEach(line => {
    if (!line) return;
    const [size, pkgPath] = line.split('\t');
    if (!pkgPath) return;
    const pkgName = path.basename(pkgPath);
    packageSizes[pkgName] = size;
  });
} catch (error) {
  console.error('Error getting package sizes:', error.message);
}

try {
  const licenseOutput = execSync('pnpm licenses list --json', { cwd: cliPath }).toString();
  try {
    const licenses = JSON.parse(licenseOutput);
    if (licenses && licenses.data) {
      licenses.data.forEach(pkg => {
        if (pkg.name && pkg.license) {
          packageLicenses[pkg.name] = pkg.license;
        }
      });
    }
  } catch (e) {
    console.error('Error parsing license JSON:', e.message);
  }
} catch (error) {
  console.error('Error getting package licenses:', error.message);
}

try {
  const npmOutput = execSync('npm list --json', { cwd: cliPath }).toString();
  try {
    const npmList = JSON.parse(npmOutput);
    
    function findDeprecated(deps, prefix = '') {
      if (!deps) return;
      
      Object.entries(deps).forEach(([name, info]) => {
        const fullName = prefix ? `${prefix}/${name}` : name;
        if (info.deprecated) {
          deprecatedPackages.push({
            name: fullName,
            version: info.version,
            message: info.deprecated
          });
        }
        
        if (info.dependencies) {
          findDeprecated(info.dependencies, fullName);
        }
      });
    }
    
    if (npmList.dependencies) {
      findDeprecated(npmList.dependencies);
    }
  } catch (e) {
    console.error('Error parsing npm list JSON:', e.message);
  }
} catch (error) {
  console.error('Error checking for deprecated packages:', error.message);
}

try {
  const commonLibs = ['semver', 'debug', 'chalk', 'glob', 'fs-extra', 'yargs'];
  
  for (const lib of commonLibs) {
    try {
      const output = execSync(`npm ls ${lib}`, { cwd: cliPath }).toString();
      const versions = new Set();
      const versionRegex = new RegExp(`${lib}@([\\d\\.]+)`, 'g');
      let match;
      
      while ((match = versionRegex.exec(output)) !== null) {
        versions.add(match[1]);
      }
      
      if (versions.size > 1) {
        duplicateVersions[lib] = Array.from(versions);
      }
    } catch (e) {
    }
  }
} catch (error) {
  console.error('Error checking for duplicate versions:', error.message);
}

let packages = [];
try {
  const output = execSync('pnpm list --json', { cwd: cliPath }).toString();
  packages = JSON.parse(output);
} catch (error) {
  console.error('Error getting installed packages:', error.message);
}

const packageCount = execSync('pnpm list | wc -l', { cwd: cliPath }).toString().trim();

const csvRows = [
  'Package,Version,License,Size,Deprecated,Duplicate Versions,Type,Recommendation'
];

Object.entries(allDeps).forEach(([pkg, version]) => {
  const license = packageLicenses[pkg] || 'Unknown';
  const size = packageSizes[pkg] || 'Unknown';
  const isDeprecated = deprecatedPackages.some(d => d.name === pkg);
  const hasDuplicates = duplicateVersions[pkg] ? duplicateVersions[pkg].join(', ') : '';
  const type = pkgJson.dependencies[pkg] ? 'Production' : 'Development';
  
  let recommendation = '';
  
  if (pkg === 'chalk') {
    recommendation = 'Replace with picocolors (smaller)';
  } else if (pkg === 'node-fetch') {
    recommendation = 'Replace with native fetch';
  } else if (pkg === 'glob') {
    recommendation = 'Replace with native fs.glob';
  } else if (isDeprecated) {
    recommendation = 'Replace (deprecated)';
  } else if (hasDuplicates) {
    recommendation = 'Consolidate versions';
  } else if (size && size.endsWith('K') && parseInt(size) < 200) {
    recommendation = 'Consider inlining (small)';
  }
  
  csvRows.push(`${pkg},${version},${license},${size},${isDeprecated},${hasDuplicates},${type},${recommendation}`);
});

fs.writeFileSync(path.join(__dirname, 'dependency-audit.csv'), csvRows.join('\n'));

const topBySize = Object.entries(packageSizes)
  .sort((a, b) => {
    const sizeA = a[1].endsWith('M') ? parseFloat(a[1]) * 1000 : parseFloat(a[1]);
    const sizeB = b[1].endsWith('M') ? parseFloat(b[1]) * 1000 : parseFloat(b[1]);
    return sizeB - sizeA;
  })
  .slice(0, 10)
  .map(([pkg, size]) => `- \`${pkg}\`: ${size}`);

const smallPackages = Object.entries(packageSizes)
  .filter(([pkg, size]) => size.endsWith('K') && parseInt(size) < 200)
  .map(([pkg, size]) => `- \`${pkg}\`: ${size}`);

const mdContent = `# Dependency Audit Report

## Summary
- Total packages: ${packageCount}
- Direct dependencies: ${Object.keys(pkgJson.dependencies).length}
- Dev dependencies: ${Object.keys(pkgJson.devDependencies).length}
- Deprecated packages: ${deprecatedPackages.length}
- Packages with multiple versions: ${Object.keys(duplicateVersions).length}

## Largest Packages
${topBySize.join('\n')}

## Deprecated Packages
${deprecatedPackages.map(d => `- \`${d.name}@${d.version}\`: ${d.message}`).join('\n') || '- None found'}

## Packages with Multiple Versions
${Object.entries(duplicateVersions).map(([pkg, versions]) => `- \`${pkg}\`: ${versions.join(', ')}`).join('\n') || '- None found'}

## Small Packages (Candidates for Inlining)
${smallPackages.join('\n')}

## Recommendations
1. Replace heavy libraries with lighter alternatives
   - \`chalk\` → \`picocolors\` (80% smaller)
   - \`node-fetch\` → native \`fetch\` (available in Node.js 18+)

2. Inline small utility packages
${smallPackages.slice(0, 5).join('\n')}

3. Consolidate duplicate versions
${Object.entries(duplicateVersions).map(([pkg, versions]) => `- \`${pkg}\`: ${versions.join(', ')} → ${versions.sort().pop()}`).join('\n') || '- None found'}

4. Remove deprecated packages
${deprecatedPackages.map(d => `- \`${d.name}@${d.version}\``).join('\n') || '- None found'}
`;

fs.writeFileSync(path.join(__dirname, 'dependency-audit.md'), mdContent);

console.log('Dependency audit complete. Reports saved to:');
console.log('- CSV: ' + path.join(__dirname, 'dependency-audit.csv'));
console.log('- Markdown: ' + path.join(__dirname, 'dependency-audit.md'));
