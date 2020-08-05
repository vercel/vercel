export default function TestPage(props) {
  return <pre>{JSON.stringify(props)}</pre>;
}

export default function getStaticProps({ params }) {
  return {
    props: {
      params,
      time: new Date().getTime(),
    },
    revalidate: false,
  };
}

export default function getStaticPaths() {
  return { paths: [], fallback: 'unstable_blocking' };
}
