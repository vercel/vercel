export const getStaticProps = ctx => {
  console.log('previewData', ctx.previewData);

  return {
    props: {
      hello: 'world',
      random: Math.random(),
    },
  };
};

export default function Docs(props) {
  return <p id="props">{JSON.stringify(props)}</p>;
}
