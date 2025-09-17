import shutil

# Caminho do diretório onde salvaremos o projeto
project_path = "/mnt/data/emagrecimento30dias_site"

# Criando estrutura básica de pastas do projeto React
folders = [
    f"{project_path}/public",
    f"{project_path}/src/components",
    f"{project_path}/src/pages",
]

for folder in folders:
    shutil.os.makedirs(folder, exist_ok=True)

# Criando arquivos principais
files_content = {
    f"{project_path}/package.json": """{
  "name": "emagrecimento30dias",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "vite": "^4.0.0",
    "tailwindcss": "^3.0.0",
    "postcss": "^8.0.0",
    "autoprefixer": "^10.0.0"
  }
}""",
    f"{project_path}/index.html": """<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Emagrecimento em 30 Dias</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>""",
    f"{project_path}/src/main.jsx": """import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './pages/App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)""",
    f"{project_path}/src/index.css": """@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: Arial, sans-serif;
}""",
    f"{project_path}/src/pages/App.jsx": """import React from 'react'
import Hero from '../components/Hero'
import Planos from '../components/Planos'
import Footer from '../components/Footer'

export default function App() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <Hero />
      <Planos />
      <Footer />
    </div>
  )
}""",
    f"{project_path}/src/components/Hero.jsx": """import React from 'react'

export default function Hero() {
  return (
    <section className="text-center py-20 bg-green-200">
      <h1 className="text-4xl font-bold text-gray-800">Emagreça em 30 Dias</h1>
      <p className="mt-4 text-lg text-gray-700">Planos práticos e saudáveis para transformar sua vida!</p>
      <a href="#planos" className="mt-6 inline-block bg-green-600 text-white px-6 py-3 rounded-full shadow-lg hover:bg-green-700 transition">Ver Planos</a>
    </section>
  )
}""",
    f"{project_path}/src/components/Planos.jsx": """import React from 'react'

export default function Planos() {
  return (
    <section id="planos" className="py-16 px-6">
      <h2 className="text-3xl font-bold text-center mb-10">Nossos Planos</h2>
      <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        
        <div className="bg-white rounded-2xl shadow-md p-6 text-center">
          <h3 className="text-xl font-semibold">Plano Básico</h3>
          <p className="mt-2 text-gray-600">Cardápio simples e dicas diárias</p>
          <p className="mt-4 font-bold text-2xl">R$ 49</p>
          <button className="mt-6 bg-green-600 text-white px-4 py-2 rounded-full hover:bg-green-700 transition">Assinar</button>
        </div>
        
        <div className="bg-white rounded-2xl shadow-md p-6 text-center border-2 border-green-600">
          <h3 className="text-xl font-semibold">Plano Premium</h3>
          <p className="mt-2 text-gray-600">Cardápio + Treinos + Suporte</p>
          <p className="mt-4 font-bold text-2xl">R$ 99</p>
          <button className="mt-6 bg-green-600 text-white px-4 py-2 rounded-full hover:bg-green-700 transition">Assinar</button>
        </div>
        
        <div className="bg-white rounded-2xl shadow-md p-6 text-center">
          <h3 className="text-xl font-semibold">Plano VIP</h3>
          <p className="mt-2 text-gray-600">Plano completo + acompanhamento</p>
          <p className="mt-4 font-bold text-2xl">R$ 149</p>
          <button className="mt-6 bg-green-600 text-white px-4 py-2 rounded-full hover:bg-green-700 transition">Assinar</button>
        </div>

      </div>
    </section>
  )
}""",
    f"{project_path}/src/components/Footer.jsx": """import React from 'react'

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 py-6 text-center">
      <p>© 2025 Emagrecimento em 30 Dias. Todos os direitos reservados.</p>
    </footer>
  )
}"""
}

for filepath, content in files_content.items():
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

# Compactar projeto em um arquivo ZIP
zip_path = "/mnt/data/emagrecimento30dias_site.zip"
shutil.make_archive(zip_path.replace(".zip", ""), 'zip', project_path)

zip_path

