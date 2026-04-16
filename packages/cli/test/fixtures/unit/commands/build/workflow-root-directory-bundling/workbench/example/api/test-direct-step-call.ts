// This route tests calling step functions directly outside of any workflow context
// After the SWC compiler changes, step functions in client mode have their directive removed
// and keep their original implementation, allowing them to be called as regular async functions

// Import from 98_duplicate_case.ts to avoid path alias imports that don't work in Vercel API functions
import { add } from '../workflows/98_duplicate_case.js';

export async function POST(req: Request) {
  const body = await req.json();
  const { x, y } = body;

  console.log(`Calling step function directly with x=${x}, y=${y}`);

  // Call step function directly as a regular async function (no workflow context)
  const result = await add(x, y);
  console.log(`add(${x}, ${y}) = ${result}`);

  return Response.json({ result });
}
