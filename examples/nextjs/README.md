import React, { useState } from "react";

// Customizador de Motos - Single-file React component (Tailwind CSS) // Instruções: // - Este arquivo é um componente React pronto para ser usado em um projeto (Create React App / Vite). // - Precisa de Tailwind CSS configurado no projeto para ficar bonito. // - As imagens das motos são SVGs simples embutidos para demonstração — substitua por imagens reais ao integrar. // - Há um formulário para adicionar novos modelos (útil para "todas as Hondas atualizadas").

export default function MotoCustomizer() { // Lista inicial de modelos — você pode expandir isso ou carregar de uma API/CSV const initialModels = [ { id: "honda-cg160", brand: "Honda", name: "CG 160" }, { id: "honda-titan160", brand: "Honda", name: "Titan 160" }, { id: "honda-cb500", brand: "Honda", name: "CB 500" }, { id: "honda-cb650", brand: "Honda", name: "CB 650" }, { id: "honda-xre190", brand: "Honda", name: "XRE 190" }, { id: "honda-cb300r", brand: "Honda", name: "CB 300R" }, { id: "honda-biz125", brand: "Honda", name: "Biz 125" }, { id: "honda-fan125", brand: "Honda", name: "Fan 125" }, { id: "yamaha-neo125", brand: "Yamaha", name: "Neo 125" }, { id: "suzuki-gs500", brand: "Suzuki", name: "GS 500" }, ];

const [models, setModels] = useState(initialModels); const [selectedModelId, setSelectedModelId] = useState(models[0].id);

// Part options const partsCatalog = [ { key: "paint", label: "Pintura (carroceria)" }, { key: "rims", label: "Rodas" }, { key: "seat", label: "Banco" }, { key: "exhaust", label: "Escapamento" }, { key: "decals", label: "Adesivos / Decalques" }, ];

// estado do customizador const [config, setConfig] = useState({ modelId: selectedModelId, colors: { paint: "#ff0000", rims: "#111111", seat: "#222222", exhaust: "#444444", decals: "#ffffff", }, parts: { rims: true, exhaust: true, decals: false, }, });

// adicionar novo modelo const [newModel, setNewModel] = useState({ brand: "", name: "", id: "" });

const selectModel = (id) => { setSelectedModelId(id); setConfig((c) => ({ ...c, modelId: id })); };

const updateColor = (partKey, color) => { setConfig((c) => ({ ...c, colors: { ...c.colors, [partKey]: color } })); };

const togglePart = (partKey) => { setConfig((c) => ({ ...c, parts: { ...c.parts, [partKey]: !c.parts[partKey] } })); };

const addModel = (e) => { e.preventDefault(); if (!newModel.name || !newModel.brand) return; const id = (newModel.brand + "-" + newModel.name).toLowerCase().replace(/\s+/g, "-"); const model = { id, brand: newModel.brand, name: newModel.name }; setModels((m) => [model, ...m]); setNewModel({ brand: "", name: "", id: "" }); selectModel(id); };

const exportJSON = () => { const exportData = { model: models.find((m) => m.id === config.modelId), config }; const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = ${exportData.model.name || 'moto'}-config.json; a.click(); URL.revokeObjectURL(url); };

const downloadPreviewPNG = () => { // Simples export: converte o SVG de preview em PNG usando canvas const svg = document.getElementById("moto-preview-svg"); if (!svg) return; const serializer = new XMLSerializer(); const svgStr = serializer.serializeToString(svg); const img = new Image(); const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }); const url = URL.createObjectURL(svgBlob); img.onload = function () { const canvas = document.createElement("canvas"); canvas.width = svg.clientWidth * 2; // retina canvas.height = svg.clientHeight * 2; const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); const pngUrl = canvas.toDataURL("image/png"); const a = document.createElement("a"); a.href = pngUrl; a.download = "moto-preview.png"; a.click(); URL.revokeObjectURL(url); }; img.src = url; };

// Small SVG bike generator — replace with real assets on integration const BikeSVG = ({ paint, rims, seat, exhaust, decals, modelName }) => { return ( <svg id="moto-preview-svg" viewBox="0 0 800 400" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"> <rect width="100%" height="100%" fill="#f5f5f7" /> <g transform="translate(40,40) scale(0.9)"> {/* body /} <g id="body"> <path d="M100 200 C180 120 420 120 500 200 L480 230 C420 190 250 220 100 200 Z" fill={paint} /> {/ tank */} <ellipse cx="250" cy="170" rx="80" ry="40" fill={paint} /> </g>

{/* wheels */}
      <g id="wheels">
        <circle cx="160" cy="260" r="60" fill={rims} stroke="#222" strokeWidth="6" />
        <circle cx="440" cy="260" r="60" fill={rims} stroke="#222" strokeWidth="6" />
        <circle cx="160" cy="260" r="18" fill="#222" />
        <circle cx="440" cy="260" r="18" fill="#222" />
      </g>

      {/* seat */}
      <g id="seat">
        <rect x="300" y="150" rx="12" ry="12" width="120" height="40" fill={seat} />
      </g>

      {/* exhaust */}
      {exhaust && (
        <g id="exhaust">
          <rect x="510" y="220" width="90" height="18" rx="9" fill={exhaust} />
          <circle cx="610" cy="229" r="10" fill={exhaust} />
        </g>
      )}

      {/* decals */}
      {decals && (
        <g id="decals">
          <path d="M120 200 L180 180 L240 200" stroke={decals} strokeWidth="6" fill="none" strokeLinecap="round" />
          <text x="280" y="200" fontFamily="Arial" fontSize="20" fill={decals}>{modelName}</text>
        </g>
      )}

    </g>
  </svg>
);

};

const selectedModel = models.find((m) => m.id === config.modelId) || models[0];

return ( <div className="min-h-screen bg-gray-50 p-6"> <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6"> {/* Sidebar: modelos + adicionar novo */} <aside className="lg:col-span-1 bg-white rounded-2xl p-4 shadow"> <h2 className="text-lg font-semibold mb-3">Modelos de motos</h2> <div className="space-y-2 max-h-64 overflow-auto pr-2"> {models.map((m) => ( <button key={m.id} onClick={() => selectModel(m.id)} className={w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 flex items-center justify-between ${ m.id === config.modelId ? "ring-2 ring-indigo-400 bg-indigo-50" : "" }} > <div> <div className="text-sm font-medium">{m.name}</div> <div className="text-xs text-gray-500">{m.brand}</div> </div> <div className="text-xs text-gray-400">ver</div> </button> ))} </div>

<form onSubmit={addModel} className="mt-4">
        <h3 className="text-sm font-medium mb-2">Adicionar novo modelo</h3>
        <input
          className="w-full border rounded px-2 py-1 mb-2"
          placeholder="Marca (ex: Honda)"
          value={newModel.brand}
          onChange={(e) => setNewModel((s) => ({ ...s, brand: e.target.value }))}
        />
        <input
          className="w-full border rounded px-2 py-1 mb-2"
          placeholder="Nome do modelo (ex: CG 160)"
          value={newModel.name}
          onChange={(e) => setNewModel((s) => ({ ...s, name: e.target.value }))}
        />
        <button className="w-full bg-indigo-600 text-white px-3 py-2 rounded">Adicionar</button>
      </form>

      <div className="mt-4 text-xs text-gray-500">
        Dica: para incluir "todas as Hondas atualizadas", importe uma lista CSV/JSON de modelos e use o botão "Adicionar" em lote — o projeto já aceita múltiplos modelos.
      </div>
    </aside>

    {/* Main preview area */}
    <main className="lg:col-span-2">
      <div className="bg-white rounded-2xl p-4 shadow mb-4">
        <div className="flex items-start gap-4">
          <div className="w-2/3">
            <div className="h-80 bg-gray-100 rounded-lg p-3 flex items-center">
              <div className="w-full">
                <BikeSVG
                  paint={config.colors.paint}
                  rims={config.colors.rims}
                  seat={config.colors.seat}
                  exhaust={config.parts.exhaust ? config.colors.exhaust : null}
                  decals={config.parts.decals ? config.colors.decals : null}
                  modelName={selectedModel?.name}
                />
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button onClick={downloadPreviewPNG} className="px-3 py-2 bg-gray-800 text-white rounded">Baixar PNG</button>
              <button onClick={exportJSON} className="px-3 py-2 bg-indigo-600 text-white rounded">Exportar JSON</button>
            </div>
          </div>

          <div className="w-1/3">
            <h3 className="text-sm font-semibold mb-2">Configurações rápidas</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600">Cor da pintura</label>
                <input type="color" value={config.colors.paint} onChange={(e) => updateColor("paint", e.target.value)} className="mt-1" />
              </div>

              <div>
                <label className="block text-xs text-gray-600">Cor das rodas</label>
                <input type="color" value={config.colors.rims} onChange={(e) => updateColor("rims", e.target.value)} className="mt-1" />
              </div>

              <div>
                <label className="block text-xs text-gray-600">Cor do banco</label>
                <input type="color" value={config.colors.seat} onChange={(e) => updateColor("seat", e.target.value)} className="mt-1" />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs text-gray-600">Exaustão</label>
                  <div className="text-xs text-gray-500">Ativar/Desativar</div>
                </div>
                <input type="checkbox" checked={!!config.parts.exhaust} onChange={() => togglePart("exhaust")} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs text-gray-600">Decalques</label>
                  <div className="text-xs text-gray-500">Ativar/Desativar</div>
                </div>
                <input type="checkbox" checked={!!config.parts.decals} onChange={() => togglePart("decals")} />
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Detailed parts editor */}
      <div className="bg-white rounded-2xl p-4 shadow">
        <h3 className="text-sm font-semibold mb-3">Editor de peças e variações</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {partsCatalog.map((p) => (
            <div key={p.key} className="border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-gray-500">Personalize cor / visibilidade</div>
                </div>
                <div>
                  {p.key !== 'paint' && (
                    <input type="checkbox" checked={!!config.parts[p.key]} onChange={() => togglePart(p.key)} />
                  )}
                </div>
              </div>
              <div className="mt-2">
                <label className="text-xs">Cor</label>
                <div className="mt-1">
                  <input type="color" value={config.colors[p.key] || '#cccccc'} onChange={(e) => updateColor(p.key, e.target.value)} />
                </div>

                <div className="mt-3 text-xs text-gray-500">Variações rápidas</div>
                <div className="mt-2 flex gap-2 flex-wrap">
                  {/* Quick swatches */}
                  {['#ffffff','#000000','#ff0000','#ff7f00','#ffd700','#2e8b57','#1e90ff','#8a2be2'].map((c) => (
                    <button key={c} onClick={() => updateColor(p.key, c)} className="w-8 h-8 rounded" style={{ background: c }} aria-label={`swatch-${c}`}></button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </main>
  </div>

  <footer className="max-w-7xl mx-auto mt-6 text-sm text-gray-500">
    <div>Projeto base: painel de customização para motos tipo "montadinhas" — expanda com galeria de peças, uploads de imagens 3D, e integração com banco de dados.</div>
  </footer>
</div>

); }

