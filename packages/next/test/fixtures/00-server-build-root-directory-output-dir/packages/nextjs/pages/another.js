export default function Page() {
  return 'another page';
}

export const getServerSideProps = () => {
  return {
    props: {
      hello: 'world',
    },
  };
};
