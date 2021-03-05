import Link from 'next/link';

const About = ({ id }) => {
  return (
    <div>
      <p>This is the {id} page with static props.</p>
      <div>
        <Link href="/">
          <a>Go Back</a>
        </Link>
      </div>
    </div>
  );
};

export const getStaticProps = ({ params }) => {
  return { props: { id: params.id } };
};
export const getStaticPaths = () => ({ paths: ['/1/dynamic'], fallback: true });

export default About;
