EleganceTime/
├── package.json
├── vite.config.js   (إذا بغينا Vite)
├── public/
│   ├── placeholder-hero.jpg
│   ├── product1.jpg
│   ├── product2.jpg
│   └── product3.jpg
└── src/
    ├── App.jsx
    ├── main.jsx
    └── index.css{
  "name": "elegance-time",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "tailwindcss": "^4.2.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()]
});@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: 'Inter', sans-serif;
  background-color: #f5f5f5;
}import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);import React from 'react';

export default function App() {
  const brands = ['Topface', 'Gabrini', 'Flormar', 'Pastel', 'Essence'];
  const categories = [
    { id: 'makeup', title: 'Makeup', subtitle: 'Foundations, Lipsticks, Palettes' },
    { id: 'skincare', title: 'Skincare', subtitle: 'Creams, Serums, Whitening' },
    { id: 'accessories', title: 'Accessories', subtitle: 'Bags, Sunglasses, Jewelry' },
  ];
  const products = [
    { id: 1, title: 'Matte Foundation', brand: 'Flormar', price: '120 MAD', img: '/product1.jpg' },
    { id: 2, title: 'Gold Shine Lipstick', brand: 'Topface', price: '60 MAD', img: '/product2.jpg' },
    { id: 3, title: 'Classic Sunglasses', brand: '—', price: '220 MAD', img: '/product3.jpg' },
  ];

  const instagramUrl = 'https://www.instagram.com/elegancetime.fes';
  const whatsappNumber = '0612427638';

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      {/* Header */}
      <header className="bg-black text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center text-black font-extrabold">ET</div>
            <div>
              <h1 className="text-lg font-bold">Elegance Time</h1>
              <p className="text-xs text-neutral-300">Bold boutique · Beauty & Accessories · Fes</p>
            </div>
          </div>
          <nav className="hidden md:flex gap-6 text-sm items-center">
            <a href="#products" className="hover:text-yellow-400">Products</a>
            <a href="#brands" className="hover:text-yellow-400">Brands</a>
            <a href="#about" className="hover:text-yellow-400">About</a>
            <a href="#contact" className="px-3 py-1 rounded-md border border-neutral-800 hover:bg-neutral-900">Contact</a>
            <a href={instagramUrl} className="px-3 py-1 rounded-md bg-yellow-400 text-black font-semibold" target="_blank" rel="noreferrer">Instagram</a>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Hero */}
        <section className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-extrabold mb-4">Elegance Time — Boutique روحية وفاخرة</h2>
            <p className="text-neutral-700 mb-6">منتجات تجميل وعناية راقية، اكسسوارات واختيارات منتقاة من ماركات معروفة. توصيل داخل فاس وخارجها — تسوقي بثقة.</p>
            <div className="flex gap-3">
              <a href="#products" className="px-5 py-3 bg-black text-yellow-400 rounded-md font-semibold">تسوقي الآن</a>
              <a href={`https://wa.me/212${whatsappNumber.replace(/^0/, '')}`} className="px-5 py-3 border border-neutral-300 rounded-md">اطلبي عبر الواتساب</a>
            </div>
          </div>
          <div className="bg-gradient-to-br from-neutral-800 to-black text-white rounded-2xl p-6 shadow-lg">
            <div className="h-64 md:h-72 rounded-lg bg-[url('/placeholder-hero.jpg')] bg-cover bg-center flex items-end p-4">
              <div className="bg-black/50 p-3 rounded">Featured: Golden Hour Collection</div>
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="mt-12">
          <h3 className="text-2xl font-bold mb-4">Categories</h3>
          <div className="grid sm:grid-cols-3 gap-6">
            {categories.map(c => (
              <div key={c.id} className="bg-white rounded-lg p-4 shadow flex flex-col">
                <div className="h-36 rounded-md bg-black/5 mb-4 flex items-end p-3">{c.title}</div>
                <p className="text-sm text-neutral-600 flex-1">{c.subtitle}</p>
                <a href={`#${c.id}`} className="mt-4 text-xs font-semibold uppercase text-yellow-500">Explore →</a>
              </div>
            ))}
          </div>
        </section>

        {/* Products */}
        <section id="products" className="mt-12">
          <h3 className="text-2xl font-bold mb-4">منتجاتنا</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map(p => (
              <div key={p.id} className="bg-white rounded-lg shadow p-4 flex flex-col">
                <div className="h-40 bg-neutral-200 rounded-md mb-4 flex items-center justify-center">
                  <img src={p.img} alt={p.title} className="object-cover h-full w-full rounded-md"/>
                </div>
                <h4 className="font-semibold">{p.title}</h4>
                <div className="text-xs text-neutral-500">{p.brand}</div>
                <p className="text-sm text-neutral-600 flex-1 mt-2">وصف قصير للمنتج يبرز الميزات، الحجم، والاستخدام.</p>
                <div className="mt-4 flex items-center justify-between">
                  <div className="font-bold">{p.price}</div>
                  <div className="flex gap-2">
                    <a href={`https://wa.me/212${whatsappNumber.replace(/^0/, '')}?text=مرحبا%20باغي%20نسول%20على%20${encodeURIComponent(p.title)}`} className="px-3 py-1 rounded-md bg-black text-yellow-400">اطلب</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Brands */}
        <section id="brands" className="mt-12 bg-white rounded-lg p-6 shadow">
          <h3 className="text-xl font-bold mb-4">العلامات التجارية</h3>
          <div className="flex flex-wrap gap-4 items-center">
            {brands.map(b => (
              <div key={b} className="px-4 py-2 border rounded-md text-sm">{b}</div>
            ))}
          </div>
        </section>

        {/* About */}
        <section id="about" className="mt-12">
          <div className="grid md:grid-cols-2 gap-6 items-center">
            <div className="bg-white rounded-lg p-6 shadow">
              <h3 className="text-xl font-bold mb-2">عن Elegance Time</h3>
              <p className="text-neutral-600">نحن متجر محلي في فاس نختار منتجات تجميل وعناية وبوتيكات إكسسوار بعناية. هدفنا نمنحك تجربة تسوق فاخرة وسهلة مع دعم عبر الواتساب والاستلام المحلي.</p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow">
              <h4 className="font-semibold mb-2">ساعات العمل</h4>
              <p className="text-sm text-neutral-600">الاثنين - السبت: 10:00 — 19:00</p>
              <h4 className="font-semibold mt-4 mb-2">مواقع التواصل</h4>
              <p className="text-sm">Instagram: <a href={instagramUrl} className="text-yellow-500" target="_blank" rel="noreferrer">@elegancetime.fes</a></p>
              <p className="text-sm">WhatsApp: <a href={`https://wa.me/212${whatsappNumber.replace(/^0/, '')}`} className="text-yellow-500">{whatsappNumber}</a></p>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="mt-12 bg-white rounded-lg p-6 shadow">
          <h3 className="text-xl font-bold mb-4">تواصل معنا</h3>
          <form onSubmit={(e) => { e.preventDefault(); alert('تم إرسال الرسالة'); }} className="grid gap-3 md:grid-cols-2">
            <input placeholder="الاسم" className="p-2 border rounded" />
            <input placeholder="الهاتف / واتساب" className="p-2 border rounded" />
            <textarea placeholder="رسالتك" className="p-2 border rounded md:col-span-2" rows={4} />
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" className="px-4 py-2 bg-black text-yellow-400 rounded-md">أرسل</button>
              <a href={instagramUrl} target="_blank" rel="noreferrer" className="px-4 py-2 border rounded-md">زور حسابنا على انستا</a>
            </div>
          </form>
        </section>

        <footer className="mt-12 py-6 text-center text-sm text-neutral-500">© {new Date().getFullYear()} Elegance Time — Designed by Ayah & ChatGPT</footer>
      </main>
    </div>
  );
}
