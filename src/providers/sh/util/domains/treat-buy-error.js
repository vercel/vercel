const error = require('../../../../util/output/error')

module.exports = function(err) {
  switch (err.code) {
    case 'invalid_domain': {
      error('Invalid domain')
      break
    }
    case 'not_available': {
      error("Domain can't be purchased at this time")
      break
    }
    case 'service_unavailabe': {
      error('Purchase failed – Service unavailable')
      break
    }
    case 'unexpected_error': {
      error('Purchase failed – Unexpected error')
      break
    }
    case 'forbidden_premium': {
      error('A coupon cannot be used to register a premium domain')
      break
    }
    default: {
      error(err.message)
    }
  }
}
