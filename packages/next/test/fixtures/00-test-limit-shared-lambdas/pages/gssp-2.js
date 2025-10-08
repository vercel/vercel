export default function Page(props) {
  return `gssp page ${JSON.stringify(props)}`;
}

export const getServerSideProps = () => {
  return {
    props: {
      gssp: true,
      random: Math.random() + Date.now(),
    },
  };
};
