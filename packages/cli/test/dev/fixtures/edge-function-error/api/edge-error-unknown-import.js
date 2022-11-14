import unknownModule from 'unknown-module-893427589372458934795843';

export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  return new Response(unknownModule('some response body'));
}
