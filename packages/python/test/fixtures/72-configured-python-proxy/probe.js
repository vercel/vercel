module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  const intercepted = await fetch(
    `https://${deploymentUrl}/protected/intercept`,
    { headers: { 'x-proxy-test': 'received' } }
  );
  const interceptedBody = await intercepted.json();
  if (intercepted.status !== 200) {
    failures.push(
      `intercepted: expected 200, got ${intercepted.status}`
    );
  }
  if (
    interceptedBody.source !== 'python-proxy' ||
    interceptedBody.request_header !== 'received'
  ) {
    failures.push(
      `intercepted: unexpected body ${JSON.stringify(interceptedBody)}`
    );
  }

  const continued = await fetch(`https://${deploymentUrl}/protected/pass`);
  const continuedBody = await continued.json();
  if (
    continued.status !== 200 ||
    continuedBody.source !== 'fastapi'
  ) {
    failures.push(
      `continued: unexpected response ${continued.status} ${JSON.stringify(
        continuedBody
      )}`
    );
  }

  const unmatched = await fetch(`https://${deploymentUrl}/unmatched`);
  const unmatchedBody = await unmatched.json();
  if (
    unmatched.status !== 200 ||
    unmatchedBody.source !== 'fastapi-unmatched'
  ) {
    failures.push(
      `unmatched: unexpected response ${unmatched.status} ${JSON.stringify(
        unmatchedBody
      )}`
    );
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
};
