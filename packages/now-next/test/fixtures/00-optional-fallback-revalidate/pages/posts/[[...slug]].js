export default function Home(props) {
  return <pre id="props">{JSON.stringify(props)}</pre>;
}

export async function getStaticPaths() {
  return {
    paths: [{ params: { slug: ['a'] } }],
    fallback: true,
  };
}

export async function getStaticProps({ params }) {
  return {
    props: {
      params,
      random: Math.random(),
    },
    revalidate: 1,
  };
}
