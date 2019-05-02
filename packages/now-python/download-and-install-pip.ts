import execa from 'execa';

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
      'Could not install "pip": "PYTHONUSERBASE" env var is not set'
    );
  }

  console.log('installing python...');
  try {
    await execa('uname', ['-a'], { stdio: 'inherit' });
    await execa('yum-config-manager', ['--enable', 'epel'], {
      stdio: 'inherit',
    });
    await execa(
      'yum',
      ['install', '-y', 'https://centos6.iuscommunity.org/ius-release.rpm'],
      { stdio: 'inherit' }
    );
    //await execa('yum', ['update'], { stdio: 'inherit' });
    await execa(
      'yum',
      [
        'install',
        '-y',
        'python36u',
        'python36u-libs',
        'python36u-devel',
        'python36u-pip',
      ],
      { stdio: 'inherit' }
    );
  } catch (err) {
    console.log('could not install python');
    throw err;
  }

  return '/usr/bin/pip3.6';
}
