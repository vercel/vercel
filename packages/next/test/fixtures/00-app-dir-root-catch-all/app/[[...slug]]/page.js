import Link from 'next/link';

export default function Page(props) {
  return (
    <div>
      <p>catch-all {JSON.stringify(props.params || {})}</p>
      <Link href="/">Link to /</Link>
      <Link href="/index">Link to /index</Link>
    </div>
  );
}

export function generateStaticParams() {
  return [
    {
      slug: [''],
    },
    {
      slug: ['index'],
    },
    {
      slug: ['first'],
    },
  ];
}

export const revalidate = 0;
