const fetch = require('node-fetch');

const github = process.env.github || {
  workflow: 'continuous-integration.yml',
  ref: 'master',
};

console.log({ github });

console.log({ env: process.env });

fetch(
  `https://api.github.com/repos/zeit/now/actions/workflows/${github.workflow}/runs`
)
  .then(res => res.json())
  .then(data => {
    data.workflow_runs
      .filter(o => o.head_branch === github.ref && o.status === 'in_progress')
      .forEach(o => {
        console.log(o);
        // TODO: send POST to `o.cancel_url` but we need to exclude the current run
      });
  });
