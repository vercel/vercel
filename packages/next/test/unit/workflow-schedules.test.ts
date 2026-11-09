import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import { getWorkflowSchedules } from '../../src/utils';

const FLOW_PAGE = '.well-known/workflow/v1/flow/route.js';
const TOPIC = '__wkf_workflow_schedule_app_sworkflows_sreport__nightlyReport';

const dirs: string[] = [];

async function appWithWorkflowConfig(
  config: unknown,
  { srcDir = false, prefix = '' } = {}
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'next-wf-schedules-'));
  dirs.push(dir);
  const generated = path.join(
    dir,
    srcDir ? 'src' : '',
    'app',
    prefix,
    '.well-known/workflow/v1'
  );
  await fs.outputFile(path.join(generated, 'flow/route.js'), '');
  await fs.outputJSON(path.join(generated, 'config.json'), config);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => fs.remove(dir)));
});

describe('getWorkflowSchedules', () => {
  test('returns the schedules the Workflow SDK wrote next to its flow route', async () => {
    const entryPath = await appWithWorkflowConfig({
      version: '0',
      workflows: { maxDuration: 'max' },
      schedules: {
        nightlyReport: {
          schedule: '0 2 * * *',
          timezone: 'America/New_York',
          topic: TOPIC,
        },
      },
    });

    expect(
      await getWorkflowSchedules({
        entryPath,
        pages: ['api/hello.js', FLOW_PAGE],
      })
    ).toEqual({
      nightlyReport: {
        schedule: '0 2 * * *',
        timezone: 'America/New_York',
        topic: TOPIC,
      },
    });
  });

  test('finds the config under a route prefix', async () => {
    const schedules = { report: { schedule: '0 1 * * *', topic: TOPIC } };
    const prefixed = await appWithWorkflowConfig(
      { schedules },
      { prefix: 'dashboard' }
    );
    expect(
      await getWorkflowSchedules({
        entryPath: prefixed,
        pages: [`dashboard/${FLOW_PAGE}`],
      })
    ).toEqual(schedules);
  });

  test('returns nothing without a flow route, a config, or schedules', async () => {
    const withoutSchedules = await appWithWorkflowConfig({ version: '0' });
    expect(
      await getWorkflowSchedules({
        entryPath: withoutSchedules,
        pages: [FLOW_PAGE],
      })
    ).toBeUndefined();
    expect(
      await getWorkflowSchedules({
        entryPath: withoutSchedules,
        pages: ['api/hello.js'],
      })
    ).toBeUndefined();
  });

  test.each([
    ['an array', [{ schedule: '0 1 * * *', topic: TOPIC }]],
    ['a schedule without a topic', { report: { schedule: '0 1 * * *' } }],
    ['a schedule without an expression', { report: { topic: TOPIC } }],
  ])('refuses %s', async (_label, schedules) => {
    const entryPath = await appWithWorkflowConfig({ schedules });
    await expect(
      getWorkflowSchedules({ entryPath, pages: [FLOW_PAGE] })
    ).rejects.toMatchObject({ code: 'INVALID_WORKFLOW_SCHEDULES' });
  });

  // Last: whether the app uses `src/` is cached for the process, as in a build.
  test('finds the config in a src directory', async () => {
    const schedules = { report: { schedule: '0 1 * * *', topic: TOPIC } };
    const inSrc = await appWithWorkflowConfig({ schedules }, { srcDir: true });
    expect(
      await getWorkflowSchedules({ entryPath: inSrc, pages: [FLOW_PAGE] })
    ).toEqual(schedules);
  });
});
