export default function Home() {
  return 'index page';
}

export const getServerSideProps = ({ locale }) => ({
  props: {
    hello: 'world',
    gsspData: true,
  },
});
