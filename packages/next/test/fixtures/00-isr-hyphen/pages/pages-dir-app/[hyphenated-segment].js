export default function Page({ params }) {
  return <div id="content">Segment Value: {params['hyphenated-segment']}</div>;
}

export async function getStaticProps({ params }) {
  return { props: { params } };
}

export async function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  };
}
