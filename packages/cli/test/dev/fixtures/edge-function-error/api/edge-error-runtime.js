export const config = {
  runtime: 'edge',
};

export default async function edge(request, event) {
  throw new Error('intentional runtime error');
}
