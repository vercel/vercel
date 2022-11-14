export const getServerSideProps = ({ params }) => {
  return {
    props: {
      hello: 'world',
      slug: params.slug,
      random: Math.random(),
    },
  };
};

export default function Page() {
  return '/dynamic/[slug]';
}
