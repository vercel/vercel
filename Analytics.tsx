// components/Analytics.tsx
export default function Analytics() {
  return (
    <section className="bg-gray-50 py-16 px-6">
      <h2 className="text-3xl font-semibold text-center mb-6">Lead Source Transparency</h2>
      <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6 text-gray-700">
        <div>
          <h3 className="font-semibold">Example Lead:</h3>
          <ul className="list-disc ml-6 mt-2">
            <li>Origin: Google Ad - “Buy Home in Kanata”</li>
            <li>Device: Mobile - iPhone 12</li>
            <li>Location: Ottawa, ON</li>
            <li>Time on Site: 4m 12s</li>
            <li>Intent Score: 9.2/10</li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold">You Get:</h3>
          <ul className="list-disc ml-6 mt-2">
            <li>Contact info with GDPR-compliant consent</li>
            <li>Behavioral intent report</li>
            <li>Lead history & visit path</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
