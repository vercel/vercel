import unknownModule from 'unknown-module-893427589372458934795843';

export const config = {
  runtime: 'edge',
};

export default async function edge(request, event) {
  return new Response(unknownModule('some response body'));
}
