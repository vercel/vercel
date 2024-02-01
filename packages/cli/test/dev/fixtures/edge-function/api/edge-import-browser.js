import generateUUID from '../vendor/generate-uuid';

export const config = {
  runtime: 'edge',
};

export default async function edge(request, event) {
  return new Response(
    JSON.stringify({
      randomString: generateUUID(),
    })
  );
}
