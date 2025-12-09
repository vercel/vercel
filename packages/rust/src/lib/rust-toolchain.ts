import { debug } from '@vercel/build-utils';
import execa from 'execa';

async function downloadRustToolchain(): Promise<void> {
  try {
    await execa(
      `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`,
      [],
      { shell: true, stdio: 'inherit' }
    );
  } catch (err) {
    let message = 'Unknown Error';
    if (err instanceof Error) {
      message = err.message;
    }
    throw new Error(`Installing Rust Toolchain via rustup failed: ${message}`);
  }
}

export const installRustToolchain = async (): Promise<void> => {
  try {
    await execa(`rustup -V`, [], { shell: true, stdio: 'ignore' });
    debug('Rust Toolchain is already installed, skipping download');
  } catch (err) {
    await downloadRustToolchain();
  }
};
