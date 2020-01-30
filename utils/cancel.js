const fetch = require('node-fetch');

const ref = process.env.GITHUB_REF; // 'refs/heads/ci-cancel-previous',
const sha = process.env.GITHUB_SHA; // 'a5d18518ea755ddc4212f47ec3448f59e0e7e3a5',
const run = process.env.GITHUB_RUN_ID; // '33175268',
const name = process.env.GITHUB_WORKFLOW; // 'CI';
const workflow = 'continuous-integration.yml';

console.log(process.env);

fetch(
  `https://api.github.com/repos/zeit/now/actions/workflows/${workflow}/runs`
)
  .then(res => res.json())
  .then(data => {
    data.workflow_runs
      .filter(o => o.head_branch === ref && o.status === 'in_progress')
      .forEach(o => {
        console.log(o);
        // TODO: send POST to `o.cancel_url` but we need to exclude the current run
      });
  });
