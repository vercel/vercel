export default function handler(request, response) {
  console.log('!!! in /api/create-contact');

  if (request.method !== 'POST') {
    throw new Error(
      `/api/create-contact called with ${request.method}, but only POST is supported.`
    );
  }
  response.status(201).json({
    contact: 'someone',
  });
}
