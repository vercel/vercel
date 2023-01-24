export default async function (request, response) {
  const reqBody = await new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('error', reject);
    request.on('close', () => resolve(Buffer.concat(chunks).toString()));
  });
  response.setHeader('content-type', 'application/json');
  response.end(
    JSON.stringify({
      reqBody,
      reqHeaders: request.headers,
      status: 'works',
    })
  );
}
