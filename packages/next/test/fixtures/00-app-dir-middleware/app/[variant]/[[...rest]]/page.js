import Link from 'next/link';

const paths = ['/', '/shop', '/product', '/who-we-are', '/about', '/contact'];

export default async function Page({ params }) {
  return (
    <>
      <p>variant: {(await params).variant}</p>
      <p>slug: {(await params).rest?.join('/')}</p>
      <ul>
        {paths.map(path => {
          return (
            <li key={path}>
              <Link href={path}>to {path}</Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
