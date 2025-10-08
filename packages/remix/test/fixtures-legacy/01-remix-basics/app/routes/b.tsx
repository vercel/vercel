import { loader } from '~/b.server';
import { useLoaderData } from '@remix-run/react';

export const config = { regions: ['sfo1'] };

export { loader };

export default function B() {
  const { hi } = useLoaderData<typeof loader>();
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.4" }}>
      <h1>B page</h1>
      <p>{hi}</p>
    </div>
  );
}
