export default function handler(request, response) {
  response.status(400).json({
    problem: 'some bad request',
  });
}
