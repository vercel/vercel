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

export const getStaticProps = ({ params }) => {
  if (params.slug?.[0] === 'index') {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      slug: params || null,
      random: Math.random() + Date.now(),
    },
    revalidate: 1,
  };
};

export const getStaticPaths = () => {
  return {
    paths: ['/first'],
    fallback: 'blocking',
  };
};
