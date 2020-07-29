import Link from 'next/link';
import dynamic from 'next/dynamic';

const Header = dynamic(import('../components/Header'));

export default function Home() {
  return (
    <div>
      <Header />
      <p>This is our homepage</p>
      <div>
        <a href="/blog">Blog</a>
      </div>
      <div>
        <Link href="/about">
          <a>About us</a>
        </Link>
      </div>
      <div>
        <Link href="/foo">
          <a>foo</a>
        </Link>
      </div>
      <div>
        <Link href="/1/dynamic">
          <a>1/dynamic</a>
        </Link>
      </div>
      <div>
        <Link href="/1/foo">
          <a>1/foo</a>
        </Link>
      </div>
    </div>
  );
}
