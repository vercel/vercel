import Link from 'next/link';

export default function MyApp({ Component, pageProps }) {
  return (
    <div>
      <Component {...pageProps} />
      <nav>
        <ul>
          <li>
            <Link href="/pages-gsp-revalidate">goto gsp-revalidate</Link>
          </li>
          <li>
            <Link href="/pages-gsp">goto gsp</Link>
          </li>
          <li>
            <Link href="/pages-gssp">goto gssp</Link>
          </li>
        </ul>{' '}
      </nav>
    </div>
  );
}
