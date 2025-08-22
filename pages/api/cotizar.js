export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { destino_cp, largo, ancho, alto, peso, valor_declarado } = req.body;

  try {
    // 1. Obtener token de Andreani
    const loginResp = await fetch("https://apis.andreanigloballpack.com/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usuario: process.env.ANDREANI_USER,
        password: process.env.ANDREANI_PASS,
      }),
    });

    const loginData = await loginResp.json();
    if (!loginData.token) {
      return res.status(401).json({ error: "Error autenticando con Andreani", detalle: loginData });
    }

    const token = loginData.token;

    // 2. Cotizar
    const cotizacionResp = await fetch("https://apis.andreanigloballpack.com/v1/cotizaciones", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        origen: { codigoPostal: "1722" }, // siempre Merlo
        destino: { codigoPostal: destino_cp },
        bultos: [
          {
            largo,
            ancho,
            alto,
            peso,
            valorDeclarado: valor_declarado,
          },
        ],
      }),
    });

    const cotizacion = await cotizacionResp.json();

    return res.status(200).json({ resultado: cotizacion });

  } catch (error) {
    console.error("Error en cotización:", error);
    return res.status(500).json({ error: "Error interno", detalle: error.message });
  }
}
