export default function Home(props) {
  return props.isOdd;
}

export async function getServerSideProps() {
  return {
    props: {
      isOdd: globalThis.isOdd(2),
    },
  };
}
