import Link from 'next/link';
import { connection } from 'next/server';

export default async function Page() {
  await connection();
  return (
    <div>
      app get dynamic
      <Link href="/app-static">goto other</Link>
    </div>
  );
}
