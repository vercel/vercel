const { italic, bold } = require('chalk')

const error = require('../../lib/utils/output/error')
const wait = require('../../lib/utils/output/wait')
const cmd = require('../../lib/utils/output/cmd')
const param = require('../../lib/utils/output/param')
const info = require('../../lib/utils/output/info')
const success = require('../../lib/utils/output/success')
const stamp = require('../../lib/utils/output/stamp')
const promptBool = require('../../lib/utils/input/prompt-bool')
const eraseLines = require('../../lib/utils/output/erase-lines')
const treatBuyError = require('../../lib/utils/domains/treat-buy-error')
const NowCreditCards = require('../../lib/credit-cards')

module.exports = async function({ domains, args, currentTeam, user, coupon }) {
  const name = args[0]
  let elapsed

  if (!name) {
    return error(`Missing domain name. Run ${cmd('now domains help')}`)
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
        return error(`The coupon ${param(coupon)} is invalid`)
      }

      if (!couponInfo.canBeUsed) {
        return error(`The coupon ${param(coupon)} has already been used`)
      }

      validCoupon = true

      if (cards.length === 0) {
        info(
          'You have no credit cards on file. Please add one in order to claim your free domain'
        )
        info(`Your card will ${bold('not')} be charged`)

        await require('../now-billing-add')({
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
    return error(err.message)
  }

  const available = await domains.status(name)

  stopSpinner()

  if (!available) {
    return error(
      `The domain ${nameParam} is ${italic('unavailable')}! ${elapsed()}`
    )
  }
  const periodMsg = `${period}yr${period > 1 ? 's' : ''}`
  info(
    `The domain ${nameParam} is ${italic('available')} to buy under ${bold(
      (currentTeam && currentTeam.slug) || user.username || user.email
    )}! ${elapsed()}`
  )
  const confirmation = await promptBool(
    `Buy now for ${bold(`$${price}`)} (${periodMsg})?`
  )

  eraseLines(1)
  if (!confirmation) {
    return info('Aborted')
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

  success(`Domain ${nameParam} purchased ${elapsed()}`)
  info(
    `You may now use your domain as an alias to your deployments. Run ${cmd(
      'now alias --help'
    )}`
  )
}
