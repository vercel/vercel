// @flow

// Packages
const aws = require('aws-sdk')
const error = require('../../util/output/error')

const getAWS = (authConfig: Object) => {
  const { credentials } = authConfig
  const awsCredentials: Object = credentials.find(c => c.provider === 'aws')

  if (!awsCredentials) {
    console.log(error('First you need to login. Please type the command "now aws login"'))
    aws.config.error = true
  } else if (awsCredentials.useVendorConfig) {
    aws.config.credentials = new aws.SharedIniFileCredentials()
  } else {
    aws.config = new aws.Config()
    aws.config.accessKeyId = awsCredentials.accessKeyId
    aws.config.secretAccessKey = awsCredentials.secretAccessKey
  }

  return aws
}

module.exports = getAWS
