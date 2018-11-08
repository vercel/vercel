const psl = require('psl');
const domainRegex = /^((?=[a-z0-9-]{1,63}\.)(xn--)?[a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,63}$/;

module.exports = inputDomain => {
  const { domain, listed } = psl.parse(inputDomain);
  return domainRegex.test(domain) && listed;
};
