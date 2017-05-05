const linelog = require('single-line-log').stdout
const range = require('lodash.range')
const ms = require('ms')
const chalk = require('chalk')
const retry = require('async-retry')

function barify(cur, tot) {
  return (
    '[' +
    range(0, cur).map(() => '=').join('') +
    range(cur, tot).map(() => '-').join('') +
    ']'
  )
}

module.exports = async function(now, url) {
  const match = await now.findDeployment(url)
  const { min, max, current } = match.scale

  let targetReplicaCount = min
  if (current < min) {
    targetReplicaCount = min
  } else if (current > max) {
    targetReplicaCount = max
  } else {
    console.log(`> Nothing to do, already scaled.`)
    return
  }

  if (targetReplicaCount === 0) {
    console.log(`> Scaled to 0 instances`)
    return
  }
  const startTime = Date.now()

  let barcurr = current
  const end = Math.max(current, max)
  linelog(
    `> Scaling to ${chalk.bold(String(targetReplicaCount) + (targetReplicaCount === 1 ? ' instance' : ' instances'))}: ` +
      barify(barcurr, end)
  )

  const instances = await retry(
    async () => {
      const res = await now.listInstances(match.uid)
      if (barcurr !== res.length) {
        barcurr = res.length
        linelog(
          `> Scaling to ${chalk.bold(String(targetReplicaCount) + (targetReplicaCount === 1 ? ' instance' : ' instances'))}: ` +
            barify(barcurr, end)
        )

        if (barcurr === targetReplicaCount) {
          linelog.clear()
          linelog(`> Scaled to ${chalk.bold(String(targetReplicaCount) + (targetReplicaCount === 1 ? ' instance' : ' instances'))}: ${chalk.gray('[' + ms(Date.now() - startTime) + ']')}\n`)
          return res
        }
      }

      throw new Error('Not ready yet')
    },
    { retries: 5000, minTimeout: 10, maxTimeout: 20 }
  )

  process.nextTick(() => {
    instances.forEach(inst => {
      console.log(` - ${chalk.underline(inst.url)}`)
    })
  })
}
