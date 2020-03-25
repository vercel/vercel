// Native
import path from 'path';

import url from 'url';
import childProcess from 'child_process';

// Packages
import fs from 'fs-extra';

import download from 'download';
import tmp from 'tmp-promise';
import isURL from 'is-url';

const cloneRepo = (parts, tmpDir, { ssh }) =>
  new Promise((resolve, reject) => {
    let host;

    switch (parts.type) {
      case 'GitLab':
        host = `gitlab.com`;
        break;
      case 'Bitbucket':
        host = `bitbucket.org`;
        break;
      default:
        host = `github.com`;
    }

    const url = ssh
      ? `git@${host}:${parts.main}`
      : `https://${host}/${parts.main}`;

    const ref =
      parts.ref || (parts.type === 'Bitbucket' ? 'default' : 'master');
    const cmd = `git clone ${url} --single-branch ${ref}`;

    childProcess.exec(cmd, { cwd: tmpDir.path }, (err, stdout) => {
      if (err) {
        reject(err);
      }

      resolve(stdout);
    });
  });

const renameRepoDir = async (pathParts, tmpDir) => {
  const tmpContents = await fs.readdir(tmpDir.path);

  const oldTemp = path.join(tmpDir.path, tmpContents[0]);
  const newTemp = path.join(tmpDir.path, pathParts.main.replace('/', '-'));

  await fs.rename(oldTemp, newTemp);
  tmpDir.path = newTemp;

  return tmpDir;
};

const capitalizePlatform = name => {
  const names = {
    github: 'GitHub',
    gitlab: 'GitLab',
    bitbucket: 'Bitbucket',
  };

  return names[name];
};

const splittedURL = fullURL => {
  const parsedURL = url.parse(fullURL);
  const pathParts = parsedURL.path.split('/');

  pathParts.shift();

  // Set path to repo...
  const main = `${pathParts[0]}/${pathParts[1]}`;

  // ...and then remove it from the parts
  pathParts.splice(0, 2);

  // Assign Git reference
  let ref = pathParts.length >= 2 ? pathParts[1] : '';

  // Firstly be sure that we haven know the ref type
  if (pathParts[0]) {
    // Then shorten the SHA of the commit
    if (pathParts[0] === 'commit' || pathParts[0] === 'commits') {
      ref = ref.substring(0, 7);
    }
  }

  // We're deploying master by default,
  // so there's no need to indicate it explicitly
  if (ref === 'master') {
    ref = '';
  }

  return {
    main,
    ref,
    type: capitalizePlatform(parsedURL.host.split('.')[0]),
  };
};

export const gitPathParts = main => {
  let ref = '';

  if (isURL(main)) {
    return splittedURL(main);
  }

  if (main.split('/')[1].includes('#')) {
    const parts = main.split('#');

    ref = parts[1];
    main = parts[0];
  }

  return {
    main,
    ref,
    type: capitalizePlatform('github'),
  };
};

const downloadRepo = async repoPath => {
  const pathParts = gitPathParts(repoPath);

  const tmpDir = await tmp.dir({
    // We'll remove it manually once deployment is done
    keep: true,
    // Recursively remove directory when calling respective method
    unsafeCleanup: true,
  });

  let gitInstalled = true;

  try {
    await cloneRepo(pathParts, tmpDir);
  } catch (err) {
    try {
      await cloneRepo(pathParts, tmpDir, { ssh: true });
    } catch (err) {
      gitInstalled = false;
    }
  }

  if (gitInstalled) {
    const renaming = await renameRepoDir(pathParts, tmpDir);
    return renaming;
  }

  let url;

  switch (pathParts.type) {
    case 'GitLab': {
      const ref = pathParts.ref ? `?ref=${pathParts.ref}` : '';
      url = `https://gitlab.com/${pathParts.main}/repository/archive.tar${ref}`;
      break;
    }
    case 'Bitbucket':
      url = `https://bitbucket.org/${pathParts.main}/get/${pathParts.ref ||
        'default'}.zip`;
      break;
    default:
      url = `https://api.github.com/repos/${pathParts.main}/tarball/${pathParts.ref}`;
  }

  try {
    await download(url, tmpDir.path, {
      extract: true,
    });
  } catch (err) {
    tmpDir.cleanup();
    return false;
  }

  const renaming = await renameRepoDir(pathParts, tmpDir);
  return renaming;
};

export const isRepoPath = path => {
  if (!path) {
    return false;
  }

  const allowedHosts = ['github.com', 'gitlab.com', 'bitbucket.org'];

  if (isURL(path)) {
    const urlParts = url.parse(path);
    const slashSplitted = urlParts.path.split('/').filter(n => n);
    const notBare = slashSplitted.length >= 2;

    if (allowedHosts.includes(urlParts.host) && notBare) {
      return true;
    }

    const err = new Error(`Host "${urlParts.host}" is unsupported.`);
    err.code = 'INVALID_URL';
    throw err;
  }

  return /[^\s\\]\/[^\s\\]/g.test(path);
};

export const fromGit = async (path, debug) => {
  let tmpDir = false;

  try {
    tmpDir = await downloadRepo(path);
  } catch (err) {
    if (debug) {
      console.log(`Could not download "${path}" repo from GitHub`);
    }
  }

  return tmpDir;
};
