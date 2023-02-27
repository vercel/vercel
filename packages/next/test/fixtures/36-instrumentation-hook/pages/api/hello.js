// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

export default async (req, res) => {
  res.status(200).json({
    isOdd: globalThis.isOdd(3),
  });
};
