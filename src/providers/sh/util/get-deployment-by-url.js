// gets a deployment by any of the following inputs:
// `http://deployment-url.now.sh/`
// `deployment-url.now.sh`

const fetch = require('./fetch-auth');
const {parse} = require('url');

const getDeploymentByUrl = async (urlOrHostname, { apiUrl, token }) => {
  if (!urlOrHostname.startsWith('http')) {
    urlOrHostname = `https://${urlOrHostname}`;
  }
  const {hostname} = parse(urlOrHostname);
  const url = `${apiUrl}/now/hosts/${encodeURIComponent(hostname)}`;
  const res = await fetch(url, token);
  if (res.ok) {
    const {deployment} = await res.json();
    return deployment;
  } else if (res.status === 404) {
    return null;
  } else {
    throw Error(`Unexpected status code ${res.status}`);
  }
}

module.exports = getDeploymentByUrl;
