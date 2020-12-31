export default function MyApp(props) {
  return (
    <>
      <p>static 404</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  );
}

export const getStaticProps = () => {
  console.log('/404 getStaticProps');
  return {
    props: {
      random: Math.random(),
      is404: true,
    },
  };
};
