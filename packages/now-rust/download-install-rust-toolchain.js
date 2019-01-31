const tar = require('tar');
const fetch = require('node-fetch');

const rustUrl = 'https://dmmcy0pwk6bqi.cloudfront.net/rust.tar.gz';
const ccUrl = 'https://dmmcy0pwk6bqi.cloudfront.net/gcc-4.8.5.tgz';

async function downloadRustToolchain() {
  console.log('downloading the rust toolchain');
  const res = await fetch(rustUrl);

  if (!res.ok) {
    throw new Error(`Failed to download: ${rustUrl}`);
  }

  const { HOME } = process.env;
  return new Promise((resolve, reject) => {
    res.body
      .on('error', reject)
      .pipe(tar.extract({ gzip: true, cwd: HOME }))
      .on('finish', () => resolve());
  });
}

async function downloadGCC() {
  console.log('downloading GCC');
  const res = await fetch(ccUrl);

  if (!res.ok) {
    throw new Error(`Failed to download: ${ccUrl}`);
  }

  return new Promise((resolve, reject) => {
    res.body
      .on('error', reject)
      // NOTE(anmonteiro): We pipe GCC into `/tmp` instead of getting a writable
      // directory from `@now/build-utils` because the GCC distribution that we
      // use is specifically packaged for AWS Lambda (where `/tmp` is writable)
      // and contains several hardcoded symlinks to paths in `/tmp`.
      .pipe(tar.extract({ gzip: true, cwd: '/tmp' }))
      .on('finish', async () => {
        const { LD_LIBRARY_PATH } = process.env;
        // Set the environment variables as per
        // https://github.com/lambci/lambci/blob/e6c9c7/home/init/gcc#L14-L17
        const newEnv = {
          PATH: '/tmp/bin:/tmp/sbin',
          LD_LIBRARY_PATH: `/tmp/lib:/tmp/lib64:${LD_LIBRARY_PATH}`,
          CPATH: '/tmp/include',
          LIBRARY_PATH: '/tmp/lib',
        };

        return resolve(newEnv);
      });
  });
}

module.exports = async () => {
  await downloadRustToolchain();

  const newEnv = await downloadGCC();

  return newEnv;
};
