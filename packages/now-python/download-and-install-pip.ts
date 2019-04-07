import { join } from 'path';
import fetch from 'node-fetch';
import execa from 'execa';
import { createWriteStream } from 'fs';
import { getWriteableDirectory } from '@now/build-utils';

const url = 'https://bootstrap.pypa.io/get-pip.py';

// downloads `get-pip.py` and returns its absolute path
async function downloadGetPipScript() {
  console.log('downloading "get-pip.py"...');
  const res = await fetch(url);

  if (!res.ok || res.status !== 200) {
    throw new Error(`Could not download "get-pip.py" from "${url}"`);
  }

  const dir = await getWriteableDirectory();
  const filePath = join(dir, 'get-pip.py');
  const writeStream = createWriteStream(filePath);

  return new Promise<string>((resolve, reject) => {
    res.body
      .on('error', reject)
      .pipe(writeStream)
      .on('finish', () => resolve(filePath));
  });
}

// downloads and installs `pip` (respecting
// process.env.PYTHONUSERBASE), and returns
// the absolute path to it
export async function downloadAndInstallPip() {
  const { PYTHONUSERBASE } = process.env;
  if (!PYTHONUSERBASE) {
    // this is the directory in which `pip` will be
    // installed to. `--user` will assume `~` if this
    // is not set, and `~` is not writeable on AWS Lambda.
    // let's refuse to proceed
    throw new Error(
      'Could not install "pip": "PYTHONUSERBASE" env var is not set',
    );
  }
  const getPipFilePath = await downloadGetPipScript();

  console.log('runing "python get-pip.py"...');
  try {
    await execa('python3', [getPipFilePath, '--user'], { stdio: 'inherit' });
  } catch (err) {
    console.log('could not install pip');
    throw err;
  }

  return join(PYTHONUSERBASE, 'bin', 'pip');
}

