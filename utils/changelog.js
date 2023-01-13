const { join } = require('path');
const { execSync } = require('child_process');
const fetch = require('node-fetch');

const parseCommits = require('./changelog/parse');
const filterLog = require('./changelog/filter');
const groupLog = require('./changelog/group');

process.chdir(join(__dirname, '..'));

async function getLatestStableTag() {
  const headers = {};

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['authorization'] = `token ${token}`;
  }

  const res = await fetch(
    'https://api.github.com/repos/vercel/vercel/releases/latest',
    {
      headers,
    }
  );
  const result = await res.json();
  if (!result.tag_name) {
    const message = result.message || JSON.stringify(result);
    throw new Error(`Failed to fetch releases from github: ${message}`);
  }

  return result.tag_name;
}

function serializeLog(groupedLog) {
  const serialized = [];

  for (let area of Object.keys(groupedLog)) {
    if (serialized.length) {
      // only push a padding-line above area if we already have content
      serialized.push('');
    }

    serialized.push(`### ${area}`);
    serialized.push('');

    for (let line of groupedLog[area]) {
      serialized.push(`- ${line}`);
    }
  }

  return serialized;
}

function generateLog(tagName) {
  const logLines = execSync(
    `git log --pretty=format:"%s [%an] &&& %H" ${tagName}...HEAD`
  )
    .toString()
    .trim()
    .split('\n');

  const commits = parseCommits(logLines);
  const filteredCommits = filterLog(commits);
  const groupedLog = groupLog(filteredCommits);
  return serializeLog(groupedLog);
}

function findUniqPackagesAffected(tagName) {
  const pkgs = new Set(
    execSync(`git diff --name-only ${tagName}...HEAD`)
      .toString()
      .trim()
      .split('\n')
      .filter(line => line.startsWith('packages/'))
      .map(line => line.split('/')[1])
      .map(pkgName => {
        try {
          return require(`../packages/${pkgName}/package.json`).name;
        } catch {
          // Failed to read package.json (perhaps the pkg was deleted)
        }
      })
      .filter(s => Boolean(s))
  );

  if (pkgs.size === 0) {
    pkgs.add('vercel');
  }

  return pkgs;
}

async function main() {
  const tagName = await getLatestStableTag();
  if (!tagName) {
    throw new Error('Unable to find last GitHub Release tag.');
  }

  const log = generateLog(tagName);
  const formattedLog = log.join('\n') || 'NO CHANGES DETECTED';
  console.log(`Changes since the last stable release (${tagName}):`);
  console.log(`\n${formattedLog}\n`);

  const pkgs = findUniqPackagesAffected(tagName);
  const pub = Array.from(pkgs).join(',');
  console.log('To publish a stable release, execute the following:');
  console.log(
    `\npnpx lerna version --message "Publish Stable" --exact --no-private --force-publish=${pub}\n`
  );
}

main().catch(console.error);
