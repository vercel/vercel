// Currently we read & parse the README file from zeit/now-examples
// TODO: create a `manifest.json` for zeit/now-examples

import fetch from 'node-fetch';

/**
 * Fetch and parse the `Frameworks and Libraries` table
 * in the README file of zeit/now-examples
 */
export async function getExampleList() {
  const response = await fetch(
    `https://raw.githubusercontent.com/zeit/now-examples/master/manifest.json`
  );

  if (response.status !== 200) {
    console.log('manifest.json missing in zeit/now-examples');
    return null;
  }

  return response.json();
}
