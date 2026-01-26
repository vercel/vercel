export default function Page({ name }) {
  return <div>{name}</div>;
}

export async function getStaticProps() {
  return {
    props: { name: 'pages get static props revalidate ' + Date.now() },
    revalidate: 1000000,
  };
}
