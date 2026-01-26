import Link from 'next/link';
export default function Page() {
  return (
    <div>
      app get static
      <Link href="/app-dynamic">goto other</Link>
    </div>
  );
}
