const tar = require('tar');
const fetch = require('node-fetch');
const execa = require('execa');

const rustUrl = 'https://dmmcy0pwk6bqi.cloudfront.net/rust.tar.gz';

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

async function installOpenSSL() {
  console.log('installing openssl-devel...');
  try {
    // need to downgrade otherwise yum can't resolve the dependencies given
    // a later version is already installed in the machine.
    await execa(
      'yum',
      ['downgrade', '-y', 'krb5-libs-1.14.1-27.41.amzn1.x86_64'],
      {
        stdio: 'inherit',
      },
    );
    await execa('yum', ['install', '-y', 'openssl-devel'], {
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('failed to `yum install -y openssl-devel`');
    throw err;
  }
}

module.exports = async () => {
  await downloadRustToolchain();
  await installOpenSSL();
};
