export default function handler(request, response) {
  if (request.method !== 'POST') {
    throw new Error(
      `/api/create-contact called with ${request.method}, but only POST is supported.`
    );
  }
  response.status(201).json({
    contact: 'someone',
  });
}
