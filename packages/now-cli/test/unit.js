import { join, sep } from 'path';
import { send } from 'micro';
import test from 'ava';
import sinon from 'sinon';
import { asc as alpha } from 'alpha-sort';
import loadJSON from 'load-json-file';
import fetch from 'node-fetch';
import createOutput from '../src/util/output';
import hash from '../src/util/hash';
import readMetadata from '../src/util/read-metadata';
import getProjectName from '../src/util/get-project-name';
import getLocalConfigPath from '../src/util/config/local-path';
import toHost from '../src/util/to-host';
import wait from '../src/util/output/wait';
import { responseError, responseErrorMessage } from '../src/util/error';
import getURL from './helpers/get-url';
import {
  npm as getNpmFiles_,
  docker as getDockerFiles_,
  staticFiles as getStaticFiles_,
} from '../src/util/get-files';
import didYouMean from '../src/util/init/did-you-mean';
import { isValidName } from '../src/util/is-valid-name';
import preferV2Deployment from '../src/util/prefer-v2-deployment';
import getUpdateCommand from '../src/util/get-update-command';
import { isCanary } from '../src/util/is-canary';

const output = createOutput({ debug: false });
const prefix = `${join(__dirname, 'fixtures', 'unit')}${sep}`;
const base = path => path.replace(prefix, '');
const fixture = name => join(prefix, name);

// Overload to force debugging
const getNpmFiles = async dir => {
  const { pkg, nowConfig, hasNowJson } = await readMetadata(dir, {
    quiet: true,
    strict: false,
  });

  const files = await getNpmFiles_(dir, pkg, nowConfig, { hasNowJson, output });
  return normalizeWindowsPaths(files);
};

const getDockerFiles = async dir => {
  const { nowConfig, hasNowJson } = await readMetadata(dir, {
    quiet: true,
    strict: false,
  });

  const files = await getDockerFiles_(dir, nowConfig, { hasNowJson, output });
  return normalizeWindowsPaths(files);
};

const getStaticFiles = async (dir, isBuilds = false) => {
  const { nowConfig, hasNowJson } = await readMetadata(dir, {
    deploymentType: 'static',
    quiet: true,
    strict: false,
  });

  const files = await getStaticFiles_(dir, nowConfig, {
    hasNowJson,
    output,
    isBuilds,
  });
  return normalizeWindowsPaths(files);
};

const normalizeWindowsPaths = files => {
  if (process.platform === 'win32') {
    const prefix = 'D:/a/now/now/packages/now-cli/test/fixtures/';
    return files.map(f => f.replace(/\\/g, '/').slice(prefix.length));
  }
  return files;
};

test('`files`', async t => {
  let files = await getNpmFiles(fixture('files-in-package'));
  t.is(files.length, 3);
  files = files.sort(alpha);
  t.is(base(files[0]), 'files-in-package/build/a/b/c/d.js');
  t.is(base(files[1]), 'files-in-package/build/a/e.js');
  t.is(base(files[2]), 'files-in-package/package.json');
});

test('`files` + `.*.swp` + `.npmignore`', async t => {
  let files = await getNpmFiles(fixture('files-in-package-ignore'));
  files = files.sort(alpha);

  t.is(files.length, 4);
  t.is(base(files[0]), 'files-in-package-ignore/build/a/b/c/d.js');
  t.is(base(files[1]), 'files-in-package-ignore/build/a/e.js');
  t.is(base(files[2]), 'files-in-package-ignore/build/a/should-be-included.js');
  t.is(base(files[3]), 'files-in-package-ignore/package.json');
});

test('`.dockerignore` files are parsed correctly', async t => {
  const path = 'dockerfile-negation';
  let files = await getDockerFiles(fixture(path));
  files = files.sort(alpha);

  t.is(files.length, 4);
  t.is(base(files[0]), `${path}/Dockerfile`);
  t.is(base(files[1]), `${path}/a.js`);
  t.is(base(files[2]), `${path}/build/a/c.js`);
  t.is(base(files[3]), `${path}/c.js`);
});

test('`files` overrides `.gitignore`', async t => {
  let files = await getNpmFiles(fixture('files-overrides-gitignore'));
  files = files.sort(alpha);

  t.is(files.length, 3);
  t.is(base(files[0]), 'files-overrides-gitignore/package.json');
  t.is(base(files[1]), 'files-overrides-gitignore/test.js');
  t.is(base(files[2]), 'files-overrides-gitignore/test.json');
});

test('`now.files` overrides `.gitignore` in Docker', async t => {
  const path = 'now-json-docker-gitignore-override';
  let files = await getDockerFiles(
    fixture(path),
    await loadJSON(getLocalConfigPath(fixture(path)))
  );
  files = files.sort(alpha);

  t.is(files.length, 5);
  t.is(base(files[0]), `${path}/Dockerfile`);
  t.is(base(files[1]), `${path}/a.js`);
  t.is(base(files[2]), `${path}/b.js`);
  t.is(base(files[3]), `${path}/build/a/c.js`);
  t.is(base(files[4]), `${path}/now.json`);
});

test('`now.files` overrides `.dockerignore` in Docker', async t => {
  const path = 'now-json-docker-dockerignore-override';
  let files = await getDockerFiles(
    fixture(path),
    await loadJSON(getLocalConfigPath(fixture(path)))
  );
  files = files.sort(alpha);

  t.is(files.length, 6);
  t.is(base(files[0]), `${path}/Dockerfile`);
  t.is(base(files[1]), `${path}/a.js`);
  t.is(base(files[2]), `${path}/b.js`);
  t.is(base(files[3]), `${path}/build/a/c.js`);
  t.is(base(files[4]), `${path}/c.js`);
  t.is(base(files[5]), `${path}/now.json`);
});

test('`now.files` overrides `.gitignore` in Node', async t => {
  const path = 'now-json-npm-gitignore-override';
  let files = await getNpmFiles(
    fixture(path),
    await loadJSON(getLocalConfigPath(fixture(path)))
  );
  files = files.sort(alpha);

  t.is(files.length, 5);
  t.is(base(files[0]), `${path}/a.js`);
  t.is(base(files[1]), `${path}/b.js`);
  t.is(base(files[2]), `${path}/build/a/c.js`);
  t.is(base(files[3]), `${path}/now.json`);
  t.is(base(files[4]), `${path}/package.json`);
});

test('`now.files` overrides `.npmignore` in Node', async t => {
  const path = 'now-json-npm-npmignore-override';
  let files = await getNpmFiles(
    fixture(path),
    await loadJSON(getLocalConfigPath(fixture(path)))
  );
  files = files.sort(alpha);

  t.is(files.length, 6);
  t.is(base(files[0]), `${path}/a.js`);
  t.is(base(files[1]), `${path}/b.js`);
  t.is(base(files[2]), `${path}/build/a/c.js`);
  t.is(base(files[3]), `${path}/c.js`);
  t.is(base(files[4]), `${path}/now.json`);
  t.is(base(files[5]), `${path}/package.json`);
});

test('`now.files` overrides `.gitignore` in Static with custom config path', async t => {
  const path = 'now-json-static-gitignore-override';

  // Simulate custom args passed by the user
  process.argv = [...process.argv, '--local-config', './now.json'];

  let files = await getStaticFiles(fixture(path));

  files = files.sort(alpha);

  t.is(files.length, 3);
  t.is(base(files[0]), `${path}/a.js`);
  t.is(base(files[1]), `${path}/b.js`);
  t.is(base(files[2]), `${path}/build/a/c.js`);
});

test('`now.files` overrides `.gitignore` in Static', async t => {
  const path = 'now-json-static-gitignore-override';
  let files = await getStaticFiles(fixture(path));
  files = files.sort(alpha);

  t.is(files.length, 3);
  t.is(base(files[0]), `${path}/a.js`);
  t.is(base(files[1]), `${path}/b.js`);
  t.is(base(files[2]), `${path}/build/a/c.js`);
});

test('discover static files without `now.files`', async t => {
  const path = 'now-json-static-no-files';
  let files = await getStaticFiles(fixture(path));
  files = files.sort(alpha);

  t.is(files.length, 4);

  t.is(base(files[0]), `${path}/a.js`);
  t.is(base(files[1]), `${path}/b.js`);
  t.is(base(files[2]), `${path}/build/a/c.js`);
  t.is(base(files[3]), `${path}/package.json`);
});

test('discover files for builds deployment', async t => {
  const path = 'now-json-static-no-files';
  let files = await getStaticFiles(fixture(path), true);
  files = files.sort(alpha);

  t.is(files.length, 4);

  t.is(base(files[0]), `${path}/a.js`);
  t.is(base(files[1]), `${path}/b.js`);
  t.is(base(files[2]), `${path}/build/a/c.js`);
  t.is(base(files[3]), `${path}/package.json`);
});

test('should observe .vercelignore file', async t => {
  const path = 'vercelignore';
  let files = await getStaticFiles(fixture(path), true);
  files = files.sort(alpha);

  t.is(files.length, 6);

  t.is(base(files[0]), `${path}/.vercelignore`);
  t.is(base(files[1]), `${path}/a.js`);
  t.is(base(files[2]), `${path}/build/sub/a.js`);
  t.is(base(files[3]), `${path}/build/sub/c.js`);
  t.is(base(files[4]), `${path}/c.js`);
  t.is(base(files[5]), `${path}/package.json`);
});

test('`now.files` overrides `.npmignore`', async t => {
  let files = await getNpmFiles(fixture('now-files-overrides-npmignore'));
  files = files.sort(alpha);

  t.is(files.length, 3);
  t.is(base(files[0]), 'now-files-overrides-npmignore/package.json');
  t.is(base(files[1]), 'now-files-overrides-npmignore/test.js');
  t.is(base(files[2]), 'now-files-overrides-npmignore/test.json');
});

test('simple', async t => {
  let files = await getNpmFiles(fixture('simple'));
  files = files.sort(alpha);

  t.is(files.length, 5);
  t.is(base(files[0]), 'simple/bin/test');
  t.is(base(files[1]), 'simple/index.js');
  t.is(base(files[2]), 'simple/lib/woot');
  t.is(base(files[3]), 'simple/lib/woot.jsx');
  t.is(base(files[4]), 'simple/package.json');
});

test('simple with main', async t => {
  let files = await getNpmFiles(fixture('simple-main'));
  t.is(files.length, 3);
  files = files.sort(alpha);
  t.is(files.length, 3);
  t.is(base(files[0]), 'simple-main/build/a.js');
  t.is(base(files[1]), 'simple-main/index.js');
  t.is(base(files[2]), 'simple-main/package.json');
});

test('directory main', async t => {
  let files = await getNpmFiles(fixture('directory-main'));
  t.is(files.length, 3);
  files = files.sort(alpha);
  t.is(files.length, 3);
  t.is(base(files[0]), 'directory-main/a/index.js');
  t.is(base(files[1]), 'directory-main/build/a.js');
  t.is(base(files[2]), 'directory-main/package.json');
});

test('extensionless main', async t => {
  let files = await getNpmFiles(fixture('extensionless-main'));
  t.is(files.length, 3);
  files = files.sort(alpha);
  t.is(files.length, 3);
  t.is(base(files[0]), 'extensionless-main/build/a.js');
  t.is(base(files[1]), 'extensionless-main/index.js');
  t.is(base(files[2]), 'extensionless-main/package.json');
});

test('hashes', async t => {
  if (process.platform === 'win32') {
    console.log('Skipping "hashes" test on Windows');
    t.is(true, true);
    return;
  }
  const files = await getNpmFiles(fixture('hashes'));
  const hashes = await hash(files);
  t.is(hashes.size, 3);
  const many = new Set(
    hashes.get('277c55a2042910b9fe706ad00859e008c1b7d172').names
  );
  t.is(many.size, 2);
  t.is(many.has(`${prefix}hashes/dei.png`), true);
  t.is(many.has(`${prefix}hashes/duplicate/dei.png`), true);
  t.is(
    hashes.get('56c00d0466fc6bdd41b13dac5fc920cc30a63b45').names[0],
    `${prefix}hashes/index.js`
  );
  t.is(
    hashes.get('706214f42ae940a01d2aa60c5e32408f4d2127dd').names[0],
    `${prefix}hashes/package.json`
  );
});

test('ignore node_modules', async t => {
  let files = await getNpmFiles(fixture('no-node_modules'));
  files = files.sort(alpha);
  t.is(files.length, 2);
  t.is(base(files[0]), 'no-node_modules/index.js');
  t.is(base(files[1]), 'no-node_modules/package.json');
});

test('ignore nested `node_modules` with .npmignore **', async t => {
  let files = await getNpmFiles(fixture('nested-node_modules'));
  files = files.sort(alpha);
  t.is(files.length, 2);
  t.is(base(files[0]), 'nested-node_modules/index.js');
  t.is(base(files[1]), 'nested-node_modules/package.json');
});

test('support whitelisting with .npmignore and !', async t => {
  let files = await getNpmFiles(fixture('negation'));
  files = files.sort(alpha);
  t.is(files.length, 2);
  t.is(base(files[0]), 'negation/a.js');
  t.is(base(files[1]), 'negation/package.json');
});

test('support `now.files`', async t => {
  let files = await getNpmFiles(fixture('now-files'));
  files = files.sort(alpha);
  t.is(files.length, 2);
  t.is(base(files[0]), 'now-files/b.js');
  t.is(base(files[1]), 'now-files/package.json');
});

test('support docker', async t => {
  let files = await getDockerFiles(fixture('dockerfile'));
  files = files.sort(alpha);
  t.is(files.length, 2);
  t.is(base(files[0]), 'dockerfile/Dockerfile');
  t.is(base(files[1]), 'dockerfile/a.js');
});

test('gets correct name of docker deployment', async t => {
  const { name, deploymentType } = await readMetadata(fixture('dockerfile'), {
    quiet: true,
    strict: false,
  });

  t.is(deploymentType, 'docker');
  t.is(name, 'test');
});

test('prefix regression', async t => {
  let files = await getNpmFiles(fixture('prefix-regression'));
  files = files.sort(alpha);
  t.is(files.length, 2);
  t.is(base(files[0]), 'prefix-regression/package.json');
  t.is(base(files[1]), 'prefix-regression/woot.js');
});

test('support `now.json` files with package.json', async t => {
  let files = await getNpmFiles(fixture('now-json'));
  files = files.sort(alpha);
  t.is(files.length, 3);
  t.is(base(files[0]), 'now-json/b.js');
  t.is(base(files[1]), 'now-json/now.json');
  t.is(base(files[2]), 'now-json/package.json');
});

test('support `now.json` files with no package.json', async t => {
  let files = await getNpmFiles(fixture('now-json-no-package'));
  files = files.sort(alpha);
  t.is(files.length, 3);
  t.is(base(files[0]), 'now-json-no-package/b.js');
  t.is(base(files[1]), 'now-json-no-package/now.json');
});

test('throw for unsupported `now.json` type property', async t => {
  const f = fixture('now-json-unsupported');

  try {
    await readMetadata(f, {
      quiet: true,
      strict: false,
    });
  } catch (err) {
    t.is(err.code, 'unsupported_deployment_type');
    t.is(err.message, 'Unsupported "deploymentType": weird-type');
  }
});

test('support `now.json` files with package.json non quiet', async t => {
  const f = fixture('now-json-no-name');
  const { deploymentType } = await readMetadata(f, {
    quiet: false,
    strict: false,
  });

  t.is(deploymentType, 'npm');

  let files = await getNpmFiles(f);
  files = files.sort(alpha);

  t.is(files.length, 3);
  t.is(base(files[0]), 'now-json-no-name/b.js');
  t.is(base(files[1]), 'now-json-no-name/now.json');
  t.is(base(files[2]), 'now-json-no-name/package.json');
});

test('support `now.json` files with package.json non quiet not specified', async t => {
  const f = fixture('now-json-no-name');
  const { deploymentType } = await readMetadata(f, {
    strict: false,
  });

  t.is(deploymentType, 'npm');

  let files = await getNpmFiles(f);
  files = files.sort(alpha);

  t.is(files.length, 3);
  t.is(base(files[0]), 'now-json-no-name/b.js');
  t.is(base(files[1]), 'now-json-no-name/now.json');
  t.is(base(files[2]), 'now-json-no-name/package.json');
});

test('No commands in Dockerfile with automatic strictness', async t => {
  const f = fixture('dockerfile-empty');

  try {
    await readMetadata(f, {
      quiet: true,
    });
  } catch (err) {
    t.is(err.code, 'no_dockerfile_commands');
    t.is(err.message, 'No commands found in `Dockerfile`');
  }
});

test('No commands in Dockerfile', async t => {
  const f = fixture('dockerfile-empty');

  try {
    await readMetadata(f, {
      quiet: true,
      strict: true,
    });
  } catch (err) {
    t.is(err.code, 'no_dockerfile_commands');
    t.is(err.message, 'No commands found in `Dockerfile`');
  }
});

test('Missing Dockerfile for `docker` type', async t => {
  const f = fixture('now-json-docker-missing');

  try {
    await readMetadata(f, {
      quiet: true,
      strict: true,
    });
  } catch (err) {
    t.is(err.code, 'dockerfile_missing');
    t.is(err.message, '`Dockerfile` missing');
  }
});

test('support `now.json` files with Dockerfile', async t => {
  const f = fixture('now-json-docker');
  const { deploymentType, nowConfig, hasNowJson } = await readMetadata(f, {
    quiet: true,
    strict: false,
  });
  t.is(deploymentType, 'docker');

  let files = await getDockerFiles(f, nowConfig, { hasNowJson });
  files = files.sort(alpha);
  t.is(files.length, 3);
  t.is(base(files[0]), 'now-json-docker/Dockerfile');
  t.is(base(files[1]), 'now-json-docker/b.js');
  t.is(base(files[2]), 'now-json-docker/now.json');
});

test('load name from Dockerfile', async t => {
  const f = fixture('now-json-docker-name');
  const { deploymentType, name } = await readMetadata(f, {
    quiet: true,
    strict: false,
  });

  t.is(deploymentType, 'docker');
  t.is(name, 'testing');
});

test('support `now.json` files with Dockerfile non quiet', async t => {
  const f = fixture('now-json-docker');
  const { deploymentType, nowConfig, hasNowJson } = await readMetadata(f, {
    quiet: false,
    strict: false,
  });
  t.is(deploymentType, 'docker');

  let files = await getDockerFiles(f, nowConfig, { hasNowJson });
  files = files.sort(alpha);
  t.is(files.length, 3);
  t.is(base(files[0]), 'now-json-docker/Dockerfile');
  t.is(base(files[1]), 'now-json-docker/b.js');
  t.is(base(files[2]), 'now-json-docker/now.json');
});

test('throws when both `now.json` and `package.json:now` exist', async t => {
  let e;
  try {
    await readMetadata(fixture('now-json-throws'), {
      quiet: true,
      strict: false,
    });
  } catch (err) {
    e = err;
  }
  t.is(e.name, 'Error');
  t.pass(
    /please ensure there's a single source of configuration/i.test(e.message)
  );
});

test('throws when `package.json` and `Dockerfile` exist', async t => {
  let e;
  try {
    await readMetadata(fixture('multiple-manifests-throws'), {
      quiet: true,
      strict: false,
    });
  } catch (err) {
    e = err;
  }
  t.is(e.code, 'multiple_manifests');
  t.pass(/ambiguous deployment/i.test(e.message));
});

test('support `package.json:now.type` to bypass multiple manifests error', async t => {
  const f = fixture('type-in-package-now-with-dockerfile');
  const { type, nowConfig, hasNowJson } = await readMetadata(f, {
    quiet: true,
    strict: false,
  });
  t.is(type, 'npm');
  t.is(nowConfig.type, 'npm');
  t.is(hasNowJson, false);
});

test('friendly error for malformed JSON', async t => {
  if (process.platform === 'win32') {
    console.log('Skipping "friendly error for malformed JSON" test on Windows');
    t.is(true, true);
    return;
  }
  const err = await t.throwsAsync(() =>
    readMetadata(fixture('json-syntax-error'), {
      quiet: true,
      strict: false,
    })
  );
  t.is(err.name, 'JSONError');
  t.is(
    err.message,
    "Unexpected token 'o' at 2:5 in test/fixtures/unit/json-syntax-error/package.json\n    oops\n    ^"
  );
});

test('simple to host', t => {
  t.is(toHost('vercel.com'), 'vercel.com');
});

test('leading // to host', t => {
  t.is(
    toHost('//zeit-logos-rnemgaicnc.now.sh'),
    'zeit-logos-rnemgaicnc.now.sh'
  );
});

test('leading http:// to host', t => {
  t.is(
    toHost('http://zeit-logos-rnemgaicnc.now.sh'),
    'zeit-logos-rnemgaicnc.now.sh'
  );
});

test('leading https:// to host', t => {
  t.is(
    toHost('https://zeit-logos-rnemgaicnc.now.sh'),
    'zeit-logos-rnemgaicnc.now.sh'
  );
});

test('leading https:// and path to host', t => {
  t.is(
    toHost('https://zeit-logos-rnemgaicnc.now.sh/path'),
    'zeit-logos-rnemgaicnc.now.sh'
  );
});

test('simple and path to host', t => {
  t.is(toHost('vercel.com/test'), 'vercel.com');
});

test('`wait` utility does not invoke spinner before n miliseconds', async t => {
  const oraStub = sinon.stub().returns({
    color: '',
    start: () => {},
    stop: () => {},
  });

  const timeOut = 200;
  const stop = wait('test', timeOut, oraStub);

  stop();

  t.truthy(oraStub.notCalled);
});

test('`wait` utility invokes spinner after n miliseconds', async t => {
  const oraStub = sinon.stub().returns({
    color: '',
    start: () => {},
    stop: () => {},
  });

  const timeOut = 200;

  const delayedWait = () =>
    new Promise(resolve => {
      const stop = wait('test', timeOut, oraStub);

      setTimeout(() => {
        resolve();
        stop();
      }, timeOut + 100);
    });

  await delayedWait();
  t.is(oraStub.calledOnce, true);
});

test('`wait` utility does not invoke spinner when stopped before delay', async t => {
  const oraStub = sinon.stub().returns({
    color: '',
    start: () => {},
    stop: () => {},
  });

  const timeOut = 200;

  const delayedWait = () =>
    new Promise(resolve => {
      const stop = wait('test', timeOut, oraStub);
      stop();

      setTimeout(() => {
        resolve();
      }, timeOut + 100);
    });

  await delayedWait();
  t.is(oraStub.notCalled, true);
});

test('4xx response error with fallback message', async t => {
  const fn = async (req, res) => {
    send(res, 404, {});
  };

  const url = await getURL(fn);
  const res = await fetch(url);
  const formatted = await responseError(res, 'Failed to load data');

  t.is(formatted.message, 'Failed to load data (404)');
});

test('4xx response error without fallback message', async t => {
  const fn = async (req, res) => {
    send(res, 404, {});
  };

  const url = await getURL(fn);
  const res = await fetch(url);
  const formatted = await responseError(res);

  t.is(formatted.message, 'Response Error (404)');
});

test('5xx response error without fallback message', async t => {
  const fn = async (req, res) => {
    send(res, 500, '');
  };

  const url = await getURL(fn);
  const res = await fetch(url);
  const formatted = await responseError(res);

  t.is(formatted.message, 'Response Error (500)');
});

test('4xx response error as correct JSON', async t => {
  const fn = async (req, res) => {
    send(res, 400, {
      error: {
        message: 'The request is not correct',
      },
    });
  };

  const url = await getURL(fn);
  const res = await fetch(url);
  const formatted = await responseError(res);

  t.is(formatted.message, 'The request is not correct (400)');
});

test('5xx response error as HTML', async t => {
  const fn = async (req, res) => {
    send(res, 500, 'This is a malformed error');
  };

  const url = await getURL(fn);
  const res = await fetch(url);
  const formatted = await responseError(res, 'Failed to process data');

  t.is(formatted.message, 'Failed to process data (500)');
});

test('5xx response error with random JSON', async t => {
  const fn = async (req, res) => {
    send(res, 500, {
      wrong: 'property',
    });
  };

  const url = await getURL(fn);
  const res = await fetch(url);
  const formatted = await responseError(res, 'Failed to process data');

  t.is(formatted.message, 'Failed to process data (500)');
});

test('getProjectName with argv - option 1', t => {
  const project = getProjectName({
    argv: {
      name: 'abc',
    },
  });
  t.is(project, 'abc');
});

test('getProjectName with argv - option 2', t => {
  const project = getProjectName({
    argv: {
      '--name': 'abc',
    },
  });
  t.is(project, 'abc');
});

test('getProjectName with now.json', t => {
  const project = getProjectName({
    argv: {},
    nowConfig: { name: 'abc' },
  });
  t.is(project, 'abc');
});

test('getProjectName with a file', t => {
  const project = getProjectName({
    argv: {},
    nowConfig: {},
    isFile: true,
  });
  t.is(project, 'files');
});

test('getProjectName with a multiple files', t => {
  const project = getProjectName({
    argv: {},
    nowConfig: {},
    paths: ['/tmp/aa/abc.png', '/tmp/aa/bbc.png'],
  });
  t.is(project, 'files');
});

test('getProjectName with a directory', t => {
  const project = getProjectName({
    argv: {},
    nowConfig: {},
    paths: ['/tmp/aa'],
  });
  t.is(project, 'aa');
});

test('4xx error message with broken JSON', async t => {
  const fn = async (req, res) => {
    send(res, 403, `32puuuh2332`);
  };

  const url = await getURL(fn);
  const res = await fetch(url);
  const formatted = await responseErrorMessage(res, 'Not authenticated');

  t.is(formatted, 'Not authenticated (403)');
});

test('4xx error message with proper message', async t => {
  const fn = async (req, res) => {
    send(res, 403, {
      error: {
        message: 'This is a test',
      },
    });
  };

  const url = await getURL(fn);
  const res = await fetch(url);
  const formatted = await responseErrorMessage(res);

  t.is(formatted, 'This is a test (403)');
});

test('5xx error message with proper message', async t => {
  const fn = async (req, res) => {
    send(res, 500, {
      error: {
        message: 'This is a test',
      },
    });
  };

  const url = await getURL(fn);
  const res = await fetch(url);
  const formatted = await responseErrorMessage(res);

  t.is(formatted, 'Response Error (500)');
});

test('4xx response error with broken JSON', async t => {
  const fn = async (req, res) => {
    send(res, 403, `122{"sss"`);
  };

  const url = await getURL(fn);
  const res = await fetch(url);
  const formatted = await responseError(res, 'Not authenticated');

  t.is(formatted.message, 'Not authenticated (403)');
});

test('4xx response error as correct JSON with more properties', async t => {
  const fn = async (req, res) => {
    send(res, 403, {
      error: {
        message: 'The request is not correct',
        additionalProperty: 'test',
      },
    });
  };

  const url = await getURL(fn);
  const res = await fetch(url);
  const formatted = await responseError(res);

  t.is(formatted.message, 'The request is not correct (403)');
  t.is(formatted.additionalProperty, 'test');
});

test('429 response error with retry header', async t => {
  const fn = async (req, res) => {
    res.setHeader('Retry-After', '20');

    send(res, 429, {
      error: {
        message: 'You were rate limited',
      },
    });
  };

  const url = await getURL(fn);
  const res = await fetch(url);
  const formatted = await responseError(res);

  t.is(formatted.message, 'You were rate limited (429)');
  t.is(formatted.retryAfter, 20);
});

test('429 response error without retry header', async t => {
  const fn = async (req, res) => {
    send(res, 429, {
      error: {
        message: 'You were rate limited',
      },
    });
  };

  const url = await getURL(fn);
  const res = await fetch(url);
  const formatted = await responseError(res);

  t.is(formatted.message, 'You were rate limited (429)');
  t.is(formatted.retryAfter, undefined);
});

test("guess user's intention with custom didYouMean", async t => {
  const examples = [
    'apollo',
    'create-react-app',
    'docz',
    'gatsby',
    'go',
    'gridsome',
    'html-minifier',
    'mdx-deck',
    'monorepo',
    'nextjs',
    'nextjs-news',
    'nextjs-static',
    'node-server',
    'nodejs',
    'nodejs-canvas-partyparrot',
    'nodejs-coffee',
    'nodejs-express',
    'nodejs-hapi',
    'nodejs-koa',
    'nodejs-koa-ts',
    'nodejs-pdfkit',
    'nuxt-static',
    'optipng',
    'php-7',
    'puppeteer-screenshot',
    'python',
    'redirect',
    'serverless-ssr-reddit',
    'static',
    'vue',
    'vue-ssr',
    'vuepress',
  ];

  t.is(didYouMean('md', examples, 0.7), 'mdx-deck');
  t.is(didYouMean('koa', examples, 0.7), 'nodejs-koa');
  t.is(didYouMean('node', examples, 0.7), 'nodejs');
  t.is(didYouMean('12345', examples, 0.7), undefined);
});

test('check platform version chanage with `preferV2Deployment`', async t => {
  {
    const localConfig = undefined;
    const pkg = null;
    const hasDockerfile = false;
    const hasServerfile = false;
    const reason = await preferV2Deployment({
      localConfig,
      pkg,
      hasDockerfile,
      hasServerfile,
    });
    t.regex(reason, /Deploying to Now 2\.0 automatically/gm);
  }

  {
    const localConfig = undefined;
    const pkg = { scripts: { start: 'echo hi' } };
    const hasDockerfile = false;
    const hasServerfile = false;
    const reason = await preferV2Deployment({
      localConfig,
      pkg,
      hasDockerfile,
      hasServerfile,
    });
    t.is(reason, null);
  }

  {
    const localConfig = undefined;
    const pkg = { scripts: { 'now-start': 'echo hi' } };
    const hasDockerfile = false;
    const hasServerfile = false;
    const reason = await preferV2Deployment({
      localConfig,
      pkg,
      hasDockerfile,
      hasServerfile,
    });
    t.is(reason, null);
  }

  {
    const localConfig = { version: 1 };
    const pkg = null;
    const hasDockerfile = false;
    const hasServerfile = false;
    const reason = await preferV2Deployment({
      localConfig,
      pkg,
      hasDockerfile,
      hasServerfile,
    });
    t.is(reason, null);
  }

  {
    const localConfig = undefined;
    const pkg = null;
    const hasDockerfile = true;
    const hasServerfile = false;
    const reason = await preferV2Deployment({
      localConfig,
      pkg,
      hasDockerfile,
      hasServerfile,
    });
    t.is(reason, null);
  }

  {
    const localConfig = undefined;
    const pkg = { scripts: { build: 'echo hi' } };
    const hasDockerfile = false;
    const hasServerfile = false;
    const reason = await preferV2Deployment({
      localConfig,
      pkg,
      hasDockerfile,
      hasServerfile,
    });
    t.regex(reason, /package\.json/gm);
  }

  {
    const localConfig = undefined;
    const pkg = null;
    const hasDockerfile = false;
    const hasServerfile = true;
    const reason = await preferV2Deployment({
      localConfig,
      pkg,
      hasDockerfile,
      hasServerfile,
    });
    t.is(reason, null);
  }
});

test('check valid name', async t => {
  t.is(isValidName('hello world'), true);
  t.is(isValidName('käse'), true);
  t.is(isValidName('ねこ'), true);
  t.is(isValidName('/'), false);
  t.is(isValidName('/#'), false);
  t.is(isValidName('//'), false);
  t.is(isValidName('/ねこ'), true);
  t.is(isValidName('привет'), true);
  t.is(isValidName('привет#'), true);
});

test('detect update command', async t => {
  const updateCommand = await getUpdateCommand();
  t.is(updateCommand, `yarn add vercel@${isCanary() ? 'canary' : 'latest'}`);
});
