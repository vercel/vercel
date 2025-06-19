// components/Features.tsx
export default function Features() {
  const items = [
    {
      title: "Hyper-Local Targeting",
      desc: "We use Ottawa-focused content and ads to attract the most relevant buyers and sellers.",
    },
    {
      title: "Transparent Lead Source",
      desc: "Each lead comes with clear data: campaign, location, device, and intent signal.",
    },
    {
      title: "Realtor-Curated",
      desc: "Built by a licensed Realtor–Developer who understands what you actually need.",
    },
  ];

  return (
    <section className="py-16 px-6 max-w-5xl mx-auto">
      <h2 className="text-3xl font-semibold text-center mb-12">Why Our Leads Work</h2>
      <div className="grid md:grid-cols-3 gap-8">
        {items.map((item, i) => (
          <div key={i} className="bg-gray-100 p-6 rounded-xl shadow">
            <h3 className="text-xl font-bold mb-2">{item.title}</h3>
            <p className="text-gray-700">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
