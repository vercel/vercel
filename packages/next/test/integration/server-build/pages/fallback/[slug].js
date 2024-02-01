export const getStaticProps = ({ params }) => {
  return {
    props: {
      hello: 'world',
      slug: params.slug,
      random: Math.random(),
    },
  };
};

export const getStaticPaths = () => {
  return {
    paths: ['/fallback/first'],
    fallback: true,
  };
};

export default function Page() {
  return '/fallback/[slug]';
}
