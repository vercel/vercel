export const config = {
  runtime: 'nodejs',
  maxDuration: 'max',
};

export default function (req, res) {
  res.end('Hi from Node');
}
