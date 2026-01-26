export default function Page({ name }) {
  return <div>{name}</div>;
}

export async function getServerSideProps() {
  return { props: { name: 'pages get server side props' } };
}
