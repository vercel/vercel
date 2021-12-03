export default function (req) {
  const isStrict = (function () {
    return !this;
  })();
  return new Response('is strict mode? ' + (isStrict ? 'yes' : 'no'));
}
