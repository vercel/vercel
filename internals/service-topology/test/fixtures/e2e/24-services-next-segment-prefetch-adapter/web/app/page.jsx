import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>Segment prefetch home</h1>
      <Link href="/dynamic" prefetch>
        go to dynamic
      </Link>
    </main>
  );
}
