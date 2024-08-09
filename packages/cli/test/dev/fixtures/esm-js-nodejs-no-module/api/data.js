import isLeapYear from 'leap-year';

export default async function handler(req, res) {
  const data = { isLeapYear: isLeapYear() };
  res.status(200).json(data);
}
