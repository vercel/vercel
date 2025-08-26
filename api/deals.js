export default async function handler(req, res) {
  const affiliateTag = "specsyou99-21";

  // Demo deals (replace later with Amazon API parsing)
  const deals = [
    {
      title: "Samsung Galaxy S23 Ultra",
      img: "https://m.media-amazon.com/images/I/71J8tz0UeJL._AC_UY327_.jpg",
      link: `https://www.amazon.com/dp/B0BLP8M9PZ?tag=${affiliateTag}`,
      price: "$999",
    },
    {
      title: "Apple AirPods Pro (2nd Gen)",
      img: "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_UY327_.jpg",
      link: `https://www.amazon.com/dp/B0BDJHVDXK?tag=${affiliateTag}`,
      price: "$229",
    },
    {
      title: "Anker 20W USB-C Charger",
      img: "https://m.media-amazon.com/images/I/61h4usZq8fL._AC_UY327_.jpg",
      link: `https://www.amazon.com/dp/B08L9TSZ1H?tag=${affiliateTag}`,
      price: "$15.99",
    },
  ];

  res.status(200).json(deals);
}
