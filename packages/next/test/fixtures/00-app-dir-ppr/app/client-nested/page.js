import { headers } from 'next/headers'

export default async function ClientPage() {
  await headers()
  
  return (
    <>
      <p>hello from app/client-nested</p>
    </>
  );
}
