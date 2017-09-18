const error = require('../../../../util/output/error')

module.exports = function(err) {
  switch (err.code) {
    case 'invalid_domain': {
      console.error(error('Invalid domain'))
      break
    }
    case 'not_available': {
      console.error(error("Domain can't be purchased at this time"))
      break
    }
    case 'service_unavailabe': {
      console.error(error('Purchase failed – Service unavailable'))
      break
    }
    case 'unexpected_error': {
      console.error(error('Purchase failed – Unexpected error'))
      break
    }
    case 'forbidden_premium': {
      console.error(error('A coupon cannot be used to register a premium domain'))
      break
    }
    default: {
      console.error(error(err.message))
    }
  }
}
