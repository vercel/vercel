export const maxDuration = 30;

export const config = {
  runtime: 'nodejs',
  memory: 1024,
  maxDuration: 60,
};

export default function (req, res) {
  res.end('Hi from Node');
}
