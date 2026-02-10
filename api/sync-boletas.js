// Vercel Serverless Function - ES Module syntax
import https from 'https';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      method: req.method 
    });
  }

  try {
    const { apiKey, año, mes } = req.body;

    // Validar
    if (!apiKey || !año || !mes) {
      return res.status(400).json({ 
        error: 'Faltan parámetros requeridos: apiKey, año, mes'
      });
    }

    const mesNum = parseInt(mes);
    if (mesNum < 1 || mesNum > 12) {
      return res.status(400).json({ error: 'Mes inválido (debe ser 1-12)' });
    }

    // Llamar a SimpleAPI
    const options = {
      hostname: 'api.simpleapi.cl',
      path: `/api/boletas_honorarios_emitidas/${año}/${mes}`,
      method: 'GET',
      headers: {
        'apikey': apiKey
      }
    };

    const result = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({
              statusCode: response.statusCode,
              data: parsed
            });
          } catch (e) {
            resolve({
              statusCode: response.statusCode,
              data: data,
              parseError: e.message
            });
          }
        });
      });

      request.on('error', (e) => {
        reject(e);
      });

      request.end();
    });

    if (result.statusCode !== 200) {
      return res.status(result.statusCode).json({
        error: 'Error desde SimpleAPI',
        statusCode: result.statusCode,
        details: result.data
      });
    }

    return res.status(200).json(result.data);

  } catch (error) {
    console.error('Error en sync-boletas:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message
    });
  }
}
