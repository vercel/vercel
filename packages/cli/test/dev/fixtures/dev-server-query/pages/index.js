export async function getServerSideProps({ req }) {
  return {
    props: {
      url: req.url,
    },
  };
}

export default function Index(props) {
  return <pre>{JSON.stringify(props)}</pre>;
}
