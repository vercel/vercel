export const config = {
  runtime: 'experimental-edge'
}

export default async function edge(request, event) {
  return new Response('some response body');

// intentional missing closing bracket to produce syntax error
// }
