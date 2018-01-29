// Packages
const { italic, bold } = require('chalk')

// Utilities
const error = require('../../../../util/output/error')
const wait = require('../../../../util/output/wait')
const cmd = require('../../../../util/output/cmd')
const param = require('../../../../util/output/param')
const info = require('../../../../util/output/info')
const success = require('../../../../util/output/success')
const stamp = require('../../../../util/output/stamp')
const promptBool = require('../../../../util/input/prompt-bool')
const eraseLines = require('../../../../util/output/erase-lines')
const treatBuyError = require('../../util/domains/treat-buy-error')
const NowCreditCards = require('../../util/credit-cards')
const addBilling = require('../billing/add')

module.exports = async function({ domains, args, currentTeam, user, coupon }) {
  const name = args[0]
  let elapsed

  if (!name) {
    return console.error(error(`Missing domain name. Run ${cmd('now domains help')}`))
  }

  const nameParam = param(name)
  let stopSpinner

  let price
  let period
  let validCoupon
  try {
    if (coupon) {
      stopSpinner = wait(`Validating coupon ${param(coupon)}`)
      const creditCards = new NowCreditCards({
        apiUrl: domains._agent._url,
        token: domains._token,
        debug: domains._debug,
        currentTeam
      })
      const [couponInfo, { cards }] = await Promise.all([
        domains.coupon(coupon),
        creditCards.ls()
      ])
      stopSpinner()

      if (!couponInfo.isValid) {
        return console.error(error(`The coupon ${param(coupon)} is invalid`))
      }

      if (!couponInfo.canBeUsed) {
        return console.error(error(`The coupon ${param(coupon)} has already been used`))
      }

      validCoupon = true

      if (cards.length === 0) {
        console.log(info(
          'You have no credit cards on file. Please add one in order to claim your free domain'
        ))
        console.log(info(`Your card will ${bold('not')} be charged`))

        await addBilling({
          creditCards,
          currentTeam,
          user,
          clear: true
        })
      }
    }
    elapsed = stamp()
    stopSpinner = wait(`Checking availability for ${nameParam}`)
    const json = await domains.price(name)
    price = validCoupon ? 0 : json.price
    period = json.period
  } catch (err) {
    stopSpinner()
    return console.error(error(err.message))
  }

  const available = await domains.status(name)
  stopSpinner()

  if (!available) {
    console.error(error(
      `The domain ${nameParam} is ${italic('unavailable')}! ${elapsed()}`
    ))
    return
  }

  const periodMsg = `${period}yr${period > 1 ? 's' : ''}`
  console.log(info(
    `The domain ${nameParam} is ${italic('available')} to buy under ${bold(
      (currentTeam && currentTeam.slug) || user.username || user.email
    )}! ${elapsed()}`
  ))
  const confirmation = await promptBool(
    `Buy now for ${bold(`$${price}`)} (${periodMsg})?`
  )

  eraseLines(1)
  if (!confirmation) {
    return console.log(info('Aborted'))
  }

  stopSpinner = wait('Purchasing')
  elapsed = stamp()
  try {
    await domains.buy({ name, coupon })
  } catch (err) {
    stopSpinner()
    return treatBuyError(err)
  }

  stopSpinner()

  console.log(success(`Domain ${nameParam} purchased ${elapsed()}`))
  console.log(info(
    `You may now use your domain as an alias to your deployments. Run ${cmd(
      'now alias --help'
    )}`
  ))
}
