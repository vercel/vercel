// Packages
import dns from 'dns';

function resolve4(host) {
  return new Promise((resolve, reject) => dns.resolve4(host, (err, answer) => {
      if (err) {
        return reject(err);
      }

      resolve(answer);
    }));
}
export default resolve4;
