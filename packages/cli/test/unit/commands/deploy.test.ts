import bytes from 'bytes';
import fs from 'fs-extra';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { fileNameSymbol } from '@vercel/client';
import { client } from '../../mocks/client';
import deploy from '../../../src/commands/deploy';
import { setupFixture } from '../../helpers/setup-fixture';
import { defaultProject, useProject } from '../../mocks/project';
import { useTeams } from '../../mocks/team';
import { useUser } from '../../mocks/user';

describe('deploy', () => {
  it('should reject deploying a single file', async () => {
    client.setArgv('deploy', __filename);
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      `Error: Support for single file deployments has been removed.\nLearn More: https://vercel.link/no-single-file-deployments\n`
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should reject deploying multiple files', async () => {
    client.setArgv('deploy', __filename, join(__dirname, 'inspect.test.ts'));
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      `Error: Can't deploy more than one path.\n`
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should reject deploying a directory that does not exist', async () => {
    client.setArgv('deploy', 'does-not-exists');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      `Error: The specified file or directory "does-not-exists" does not exist.\n`
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should reject deploying when `--prebuilt` is used and `vc build` failed before Builders', async () => {
    const cwd = setupFixture('build-output-api-failed-before-builds');

    client.setArgv('deploy', cwd, '--prebuilt');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      '> Prebuilt deployment cannot be created because `vercel build` failed with error:\n\nError: The build failed (top-level)\n'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should reject deploying when `--prebuilt` is used and `vc build` failed within a Builder', async () => {
    const cwd = setupFixture('build-output-api-failed-within-build');

    client.setArgv('deploy', cwd, '--prebuilt');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      '> Prebuilt deployment cannot be created because `vercel build` failed with error:\n\nError: The build failed within a Builder\n'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should reject deploying a directory that does not contain ".vercel/output" when `--prebuilt` is used', async () => {
    client.setArgv('deploy', __dirname, '--prebuilt');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Error: The "--prebuilt" option was used, but no prebuilt output found in ".vercel/output". Run `vercel build` to generate a local build.\n'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should reject deploying a directory that was built with a different target environment when `--prebuilt --prod` is used on "preview" output', async () => {
    const cwd = setupFixture('build-output-api-preview');

    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'build-output-api-preview',
      name: 'build-output-api-preview',
    });

    client.setArgv('deploy', cwd, '--prebuilt', '--prod');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Error: The "--prebuilt" option was used with the target environment "production",' +
        ' but the prebuilt output found in ".vercel/output" was built with target environment "preview".' +
        ' Please run `vercel --prebuilt`.\n' +
        'Learn More: https://vercel.link/prebuilt-environment-mismatch\n'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should reject deploying a directory that was built with a different target environment when `--prebuilt` is used on "production" output', async () => {
    const cwd = setupFixture('build-output-api-production');

    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'build-output-api-preview',
      name: 'build-output-api-preview',
    });

    client.setArgv('deploy', cwd, '--prebuilt');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Error: The "--prebuilt" option was used with the target environment "preview",' +
        ' but the prebuilt output found in ".vercel/output" was built with target environment "production".' +
        ' Please run `vercel --prebuilt --prod`.\n' +
        'Learn More: https://vercel.link/prebuilt-environment-mismatch\n'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should reject deploying "version: 1"', async () => {
    client.setArgv('deploy');
    client.localConfig = {
      [fileNameSymbol]: 'vercel.json',
      version: 1,
    };
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Error: The value of the `version` property within vercel.json can only be `2`.\n'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should reject deploying "version: {}"', async () => {
    client.setArgv('deploy');
    client.localConfig = {
      [fileNameSymbol]: 'vercel.json',
      // @ts-ignore
      version: {},
    };
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Error: The `version` property inside your vercel.json file must be a number.\n'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should send a tgz file when `--archive=tgz`', async () => {
    const cwd = setupFixture('commands/deploy/archive');
    const originalCwd = process.cwd();
    try {
      process.chdir(cwd);

      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'archive',
        id: 'archive',
      });

      let body: any;
      client.scenario.post(`/v13/deployments`, (req, res) => {
        body = req.body;
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_archive_test',
        });
      });
      client.scenario.get(`/v13/deployments/dpl_archive_test`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_archive_test',
          readyState: 'READY',
          aliasAssigned: true,
          alias: [],
        });
      });
      client.scenario.get(
        `/v10/now/deployments/dpl_archive_test`,
        (req, res) => {
          res.json({
            creator: {
              uid: user.id,
              username: user.username,
            },
            id: 'dpl_archive_test',
            readyState: 'READY',
            aliasAssigned: true,
            alias: [],
          });
        }
      );

      client.setArgv('deploy', '--archive=tgz');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);
      expect(body?.files?.length).toEqual(1);
      expect(body?.files?.[0].file).toEqual('.vercel/source.tgz');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should upload missing files', async () => {
    const cwd = setupFixture('commands/deploy/archive');
    const originalCwd = process.cwd();

    // Add random 1mb file
    await fs.writeFile(join(cwd, 'data'), randomBytes(bytes('1mb')));

    try {
      process.chdir(cwd);

      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'archive',
        id: 'archive',
      });

      let body: any;
      let fileUploaded = false;
      client.scenario.post(`/v13/deployments`, (req, res) => {
        if (fileUploaded) {
          body = req.body;
          res.json({
            creator: {
              uid: user.id,
              username: user.username,
            },
            id: 'dpl_archive_test',
          });
        } else {
          const sha = req.body.files[0].sha;
          res.status(400).json({
            error: {
              code: 'missing_files',
              message: 'Missing files',
              missing: [sha],
            },
          });
        }
      });
      client.scenario.post('/v2/files', (req, res) => {
        // Wait for file to be finished uploading
        req.on('data', () => {
          // Noop
        });
        req.on('end', () => {
          fileUploaded = true;
          res.end();
        });
      });
      client.scenario.get(`/v13/deployments/dpl_archive_test`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_archive_test',
          readyState: 'READY',
          aliasAssigned: true,
          alias: [],
        });
      });
      client.scenario.get(
        `/v10/now/deployments/dpl_archive_test`,
        (req, res) => {
          res.json({
            creator: {
              uid: user.id,
              username: user.username,
            },
            id: 'dpl_archive_test',
            readyState: 'READY',
            aliasAssigned: true,
            alias: [],
          });
        }
      );

      // When stderr is not a TTY we expect 5 progress lines to be printed
      client.stderr.isTTY = false;

      client.setArgv('deploy', '--archive=tgz');
      const uploadingLines: string[] = [];
      client.stderr.on('data', data => {
        if (data.startsWith('Uploading [')) {
          uploadingLines.push(data);
        }
      });
      client.stderr.resume();
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);
      expect(body?.files?.length).toEqual(1);
      expect(body?.files?.[0].file).toEqual('.vercel/source.tgz');
      expect(uploadingLines.length).toEqual(5);
      expect(
        uploadingLines[0].startsWith('Uploading [--------------------]')
      ).toEqual(true);
      expect(
        uploadingLines[1].startsWith('Uploading [=====---------------]')
      ).toEqual(true);
      expect(
        uploadingLines[2].startsWith('Uploading [==========----------]')
      ).toEqual(true);
      expect(
        uploadingLines[3].startsWith('Uploading [===============-----]')
      ).toEqual(true);
      expect(
        uploadingLines[4].startsWith('Uploading [====================]')
      ).toEqual(true);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
