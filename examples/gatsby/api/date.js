export default function handler(req, res) {
  const date = new Date().toString();
  res.status(200).send(date);
};