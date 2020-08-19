export const getStaticProps = ctx => {
  console.log('previewData', ctx.previewData);

  return {
    props: {
      hello: 'world',
      params: ctx.params,
      random: Math.random(),
    },
  };
};

export const getStaticPaths = () => {
  return {
    paths: [['first'], ['second'], ['another', 'one']].map(rest => ({
      params: { rest },
    })),
    fallback: false,
  };
};

export default function Docs(props) {
  return <p id="props">{JSON.stringify(props)}</p>;
}
