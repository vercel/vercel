export default function NotFound() {
  return '404 page';
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
