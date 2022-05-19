export default function Another() {
  return 'another page';
}

export const getStaticProps = () => {
  return {
    props: {
      hello: 'world',
    },
    revalidate: 1,
  };
};
