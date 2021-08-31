import { join } from 'path';
import { fileNameSymbol } from '@vercel/client';
import { client } from '../mocks/client';
import deploy from '../../src/commands/deploy';

describe('deploy', () => {
  it('should reject deploying a single file', async () => {
    client.setArgv('deploy', __filename);
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(1);
    expect(client.outputBuffer).toEqual(
      `Error! Support for single file deployments has been removed.\nLearn More: https://err.sh/vercel/no-single-file-deployments\n`
    );
  });

  it('should reject deploying multiple files', async () => {
    client.setArgv('deploy', __filename, join(__dirname, 'inspect.test.ts'));
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(1);
    expect(client.outputBuffer).toEqual(
      `Error! Can't deploy more than one path.\n`
    );
  });

  it('should reject deploying a directory that does not exist', async () => {
    client.setArgv('deploy', 'does-not-exists');
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(1);
    expect(client.outputBuffer).toEqual(
      `Error! The specified file or directory "does-not-exists" does not exist.\n`
    );
  });

  it('should reject deploying "version: 1"', async () => {
    client.setArgv('deploy');
    client.localConfig = {
      [fileNameSymbol]: 'vercel.json',
      version: 1,
    };
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(1);
    expect(client.outputBuffer).toEqual(
      'Error! The value of the `version` property within vercel.json can only be `2`.\n'
    );
  });

  it('should reject deploying "version: {}"', async () => {
    client.setArgv('deploy');
    client.localConfig = {
      [fileNameSymbol]: 'vercel.json',
      // @ts-ignore
      version: {},
    };
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(1);
    expect(client.outputBuffer).toEqual(
      'Error! The `version` property inside your vercel.json file must be a number.\n'
    );
  });
});
