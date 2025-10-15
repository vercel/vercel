import { headers } from 'next/headers' 

export default async function HelloPage(props) {
  await headers()

  return (
    <>
      <p>hello from app/dashboard/rootonly/hello</p>
    </>
  );
}
