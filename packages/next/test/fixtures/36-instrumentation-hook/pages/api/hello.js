export default async (req, res) => {
  res.status(200).json({
    isOdd: globalThis.isOdd(3),
  });
};
