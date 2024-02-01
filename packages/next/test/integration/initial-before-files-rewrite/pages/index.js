export const getServerSideProps = () => {
  return {
    props: {
      hello: 'world',
      random: Math.random(),
    },
  };
};

export default function Page() {
  return '/index';
}
