module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  const res = await fetch(`https://${deploymentUrl}/static/index.html`);
  const body = await res.text();
  if (res.status !== 200) failures.push(`expected 200, got ${res.status}`);
  if (!body.includes('Hello World')) {
    failures.push(`expected Hello World, got ${JSON.stringify(body)}`);
  }
  if (res.headers.get('x-fastapi-middleware') !== 'ran') {
    failures.push('ordinary StaticFiles mount bypassed FastAPI middleware');
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
