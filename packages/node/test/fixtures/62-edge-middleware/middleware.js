export default () => {
  const response = new Response();

  // Set custom header
  response.headers.set('x-modified-edge', 'true');

  // "Pass through" the middleware to complete the HTTP request
  response.headers.set('x-middleware-next', '1');

  return response;
};
