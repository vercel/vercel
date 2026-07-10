module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  async function check({
    name,
    path,
    method = 'GET',
    accept,
    status,
    bodyIncludes,
    middlewareExpectation = 'ran',
  }) {
    const headers = {};
    if (accept) headers.accept = accept;

    const response = await fetch(`https://${deploymentUrl}${path}`, {
      method,
      headers,
    });
    const body = await response.text();
    const middlewareHeader = response.headers.get('x-fastapi-middleware');

    console.log(
      `[fastapi-frontend] ${name}: status=${response.status} middleware=${middlewareHeader} body=${JSON.stringify(body)}`
    );

    if (response.status !== status) {
      failures.push(
        `${name}: expected status ${status}, got ${response.status}`
      );
    }
    if (bodyIncludes && !body.includes(bodyIncludes)) {
      failures.push(
        `${name}: expected body to include ${JSON.stringify(bodyIncludes)}, got ${JSON.stringify(body)}`
      );
    }
    if (middlewareExpectation === 'ran' && middlewareHeader !== 'ran') {
      failures.push(
        `${name}: expected x-fastapi-middleware=ran, got ${JSON.stringify(middlewareHeader)}`
      );
    }
    if (middlewareExpectation === 'bypassed' && middlewareHeader !== null) {
      failures.push(
        `${name}: expected FastAPI middleware to be bypassed, got x-fastapi-middleware=${JSON.stringify(middlewareHeader)}`
      );
    }
  }

  await check({
    name: 'API route wins over a frontend file',
    path: '/api/collision.txt',
    status: 200,
    bodyIncludes: 'API_ROUTE_WON',
  });
  await check({
    name: 'CDN frontend file bypasses FastAPI middleware',
    path: '/middleware.txt',
    status: 200,
    bodyIncludes: 'MIDDLEWARE_FRONTEND_FILE',
    middlewareExpectation: 'bypassed',
  });
  await check({
    name: 'another CDN frontend file bypasses FastAPI middleware',
    path: '/asset.txt',
    status: 200,
    bodyIncludes: 'SECOND_FRONTEND_FILE',
    middlewareExpectation: 'bypassed',
  });
  await check({
    name: 'browser navigation uses the index fallback',
    path: '/client/route',
    accept: 'text/html',
    status: 200,
    bodyIncludes: 'FRONTEND_INDEX_FALLBACK',
  });
  await check({
    name: 'missing asset does not use the index fallback',
    path: '/missing.js',
    accept: 'text/html',
    status: 404,
  });
  await check({
    name: 'POST to an existing frontend file is method not allowed',
    path: '/middleware.txt',
    method: 'POST',
    status: 405,
    middlewareExpectation: 'either',
  });
  await check({
    name: 'included APIRouter frontend is served from the CDN',
    path: '/nested/router.txt',
    status: 200,
    bodyIncludes: 'ROUTER_FRONTEND_FILE',
    middlewareExpectation: 'bypassed',
  });

  if (failures.length > 0) {
    throw new Error(
      `FastAPI frontend semantics failed:\n- ${failures.join('\n- ')}`
    );
  }
};
