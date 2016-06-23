import dns from 'dns';

export function resolve4 (host) {
  return new Promise((resolve, reject) => {
    return dns.resolve4(host, (err, answer) => {
      if (err) return reject(err);
      resolve(answer);
    });
  });
}
