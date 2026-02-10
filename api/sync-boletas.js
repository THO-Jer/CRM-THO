module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey, año, mes } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'API Key es requerida' });
  }

  if (!año || !mes) {
    return res.status(400).json({ error: 'Año y mes son requeridos' });
  }

  const mesNum = parseInt(mes);
  if (mesNum < 1 || mesNum > 12) {
    return res.status(400).json({ error: 'Mes inválido (debe ser 1-12)' });
  }

  try {
    const response = await fetch(
      `https://api.simpleapi.cl/api/boletas_honorarios_emitidas/${año}/${mes}`,
      {
        method: 'GET',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error from SimpleAPI:', errorText);
      return res.status(response.status).json({
        error: `Error ${response.status} desde SimpleAPI`,
        details: errorText
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Error en sync-boletas:', error);
    return res.status(500).json({
      error: 'Error al conectar con SimpleAPI',
      message: error.message
    });
  }
};
