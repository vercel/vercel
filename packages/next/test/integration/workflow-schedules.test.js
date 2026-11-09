process.env.NEXT_BUILDER_INTEGRATION = '1';
process.env.NEXT_TELEMETRY_DISABLED = '1';

const path = require('path');
const builder = require('../../');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

vi.setConfig({ testTimeout: 360000, hookTimeout: 360000 });

// The Workflow SDK writes `config.json` next to its generated flow route, with
// the flow function's options and the static schedules its workflows declare
// (`experimental_schedule`). The builder applies the options to the function
// and returns the schedules with the build result.
it('returns the schedules the Workflow SDK declares next to its flow route', async () => {
  const { buildResult } = await runBuildLambda(
    path.join(__dirname, 'workflow-schedules')
  );

  expect(buildResult.schedules).toEqual({
    nightlyReport: {
      schedule: '0 2 * * *',
      timezone: 'America/New_York',
      topic: '__wkf_workflow_schedule_workflows_snightly-report__nightlyReport',
    },
  });

  // The flow function still gets its queue trigger from the same file.
  const flow = Object.entries(buildResult.output).find(([name]) =>
    name.includes('.well-known/workflow/v1/flow')
  )?.[1];
  expect(flow?.experimentalTriggers).toEqual([
    expect.objectContaining({
      type: 'queue/v2beta',
      topic: '__wkf_workflow_*',
    }),
  ]);
});
