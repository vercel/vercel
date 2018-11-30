import { stdout as linelog } from 'single-line-log';
import range from 'lodash.range';
import ms from 'ms';
import chalk from 'chalk';
import plural from 'pluralize';
import retry from 'async-retry';

function barify(cur, tot) {
  return (
    `[${ 
    range(0, cur)
      .map(() => '=')
      .join('') 
    }${range(cur, tot)
      .map(() => '-')
      .join('') 
    }]`
  );
}

export default async function(now, url) {
  const match = await now.findDeployment(url);
  const { min, max, current } = match.scale;

  let targetReplicaCount = min;
  if (current < min) {
    targetReplicaCount = min;
  } else if (current > max) {
    targetReplicaCount = max;
  } else {
    return;
  }

  if (targetReplicaCount === 0) {
    console.log(`> Scaled to 0 instances`);
    return;
  }
  const startTime = Date.now();

  let barcurr = current;
  const end = Math.max(current, max);
  linelog(
    `${chalk.gray('>')} Scaling to ${chalk.bold(
      plural('instance', targetReplicaCount, true)
    )}: ${  barify(barcurr, end)}`
  );

  const instances = await retry(
    async () => {
      const res = await now.listInstances(match.uid);
      if (barcurr !== res.length) {
        barcurr = res.length;
        linelog(
          `${chalk.gray('>')} Scaling to ${chalk.bold(
            plural('instance', targetReplicaCount, true)
          )}: ${  barify(barcurr, end)}`
        );

        if (barcurr === targetReplicaCount) {
          linelog.clear();
          linelog(
            `> Scaled to ${chalk.bold(
              plural('instance', targetReplicaCount, true)
            )}: ${chalk.gray(`[${  ms(Date.now() - startTime)  }]`)}\n`
          );
          return res;
        }
      }

      throw new Error('Not ready yet');
    },
    { retries: 5000, minTimeout: 10, maxTimeout: 20 }
  );

  process.nextTick(() => {
    instances.forEach(inst => {
      console.log(`${chalk.gray('-')} ${chalk.underline(inst.url)}`);
    });
  });
};
