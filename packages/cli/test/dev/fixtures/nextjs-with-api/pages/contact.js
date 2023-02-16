import request from 'request';

const imageUrlToBase64 = async url => {
  const r = request.defaults({ encoding: null });

  return new Promise((resolve, reject) => {
    r.get(url, function (error, response, body) {
      if (error) {
        return reject(error);
      }
      if (response.statusCode >= 400) {
        return reject(
          new Error(`Failed to fetch image (${response.statusCode}): ${url}`)
        );
      }
      resolve(
        'data:' +
          response.headers['content-type'] +
          ';base64,' +
          Buffer.from(body).toString('base64')
      );
    });
  });
};

// make these requests on the serverside to trigger the requests
// like a browser would, but without having to set up a browser
// in for this text fixture to operate
export async function getServerSideProps(context) {
  let host = context.req.headers['x-forwarded-host'];
  if (process.env.CI) {
    host = host.replace('localhost', '127.0.0.1');
  }
  const base = `http://${host}`;

  const contactUrl = new URL('/api/create-contact', base);
  const contactResponse = await fetch(contactUrl, {
    method: 'POST',
  });
  const contact = await contactResponse.text();

  const teamUrl = new URL('/team.jpg', base).toString();
  const teamSrcData = await imageUrlToBase64(teamUrl);

  return {
    props: {
      contact,
      teamSrcData,
    },
  };
}

export default function Contact({ contact, teamSrcData }) {
  return (
    <>
      <h1>Contact Page</h1>
      <div>
        Team:
        <br />
        <img src={teamSrcData} alt="team" width="100" height="100" />
      </div>
      <div>Contact: {contact}</div>
    </>
  );
}
