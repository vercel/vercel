const moment = require('moment')

module.exports = (req, res) => {
  const currentTime = moment().format('MMMM Do YYYY, h:mm:ss a')

  res.end(currentTime)
}