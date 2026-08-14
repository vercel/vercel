// Duplicate workflow from 99_e2e.ts to ensure we handle unique IDs
// and the function isn't dropped from colliding export names
export async function addTenWorkflow(input: number) {
  'use workflow';
  const a = await add(input, 2);
  const b = await add(a, 3);
  const c = await add(b, 5);
  return c;
}

// Duplicate step from 99_e2e.ts to ensure we handle unique IDs
// and the function isn't dropped from colliding export names
export async function add(a: number, b: number) {
  'use step';
  return a + b;
}
