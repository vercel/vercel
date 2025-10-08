import Link from 'next/link';

export default function Home(props) {
  return (
    <>
      <p>home {JSON.stringify(props)}</p>
      <Link href="/">
        <a>to /</a>
      </Link>
    </>
  );
}

export const getStaticProps = () => {
  return {
    props: {
      hello: 'world',
      random: Math.random() + Date.now(),
    },
    revalidate: 1,
  };
};
