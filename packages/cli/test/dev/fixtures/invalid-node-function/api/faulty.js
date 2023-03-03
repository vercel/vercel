// invalid edge function: does not export runtime

export default async function edge(request, event) {
  return new Response('hello there');
}
