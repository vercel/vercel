import { json } from '@remix-run/server-runtime';
import { useLoaderData } from '@remix-run/react';
import type { LoaderArgs } from '@remix-run/server-runtime';

export const loader = ({ request }: LoaderArgs) => {
  const instanceOfRequest = request instanceof Request;
  return json({ instanceOfRequest });
};

export default function InstanceOf() {
  const data = useLoaderData<typeof loader>();
  return <div>{`InstanceOfRequest: ${data.instanceOfRequest}`}</div>;
}
