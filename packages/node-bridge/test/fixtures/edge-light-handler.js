export default async function (request) {
  return Response.json({
    reqHeaders: Object.fromEntries(request.headers.entries()),
    reqBody: await request.text(),
    status: 'works',
  });
}
