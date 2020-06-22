import Link from 'next/link';
import { useRouter } from 'next/router';

const About = () => {
  const router = useRouter();
  const { id } = router.query;
  return (
    <div>
      <p>This is the about static page.</p>
      <div>
        <Link href="/">
          <a>Go Back</a>
        </Link>
      </div>
    </div>
  );
};

export default About;
