export const config = {
  runtime: 'invalid-runtime-value',
};

export default async function edge(request, event) {
  throw new Error('intentional runtime error');
}
