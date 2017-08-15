// @flow

const aws = require('aws-sdk')

const getAWS = authConfig => {
  const { credentials } = authConfig
  const awsCredentials: Object = credentials.find(c => c.provider === 'aws')

  if (awsCredentials.useVendorConfig) {
    aws.config.credentials = new aws.SharedIniFileCredentials()
  } else {
    aws.config = new aws.Config()
    aws.config.accessKeyId = awsCredentials.accessKeyId
    aws.config.secretAccessKey = awsCredentials.secretAccessKey
  }

  return aws
}

module.exports = getAWS
