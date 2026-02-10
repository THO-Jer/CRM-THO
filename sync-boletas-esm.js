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
    if (!apiKey || !año) {
      return res.status(400).json({ 
        error: 'Faltan parámetros requeridos: apiKey, año'
      });
    }

    // Determinar si pedir mes específico o todo el año
    let urlPath;
    if (mes) {
      const mesPad = String(mes).padStart(2, '0'); // 1 -> 01
      urlPath = `/api/bhe/listado/recibidas/${mesPad}/${año}`;
    } else {
      // Si no hay mes, traer enero-diciembre y concatenar
      urlPath = `/api/bhe/listado/recibidas/${año}`; // o hacer 12 llamadas
    }
    
    console.log('=== DEBUG INFO ===');
    console.log('API Key (primeros 10 chars):', apiKey.substring(0, 10) + '...');
    console.log('Año:', año);
    console.log('Mes:', mes || 'TODO EL AÑO');
    console.log('URL completa:', `https://servicios.simpleapi.cl${urlPath}`);
    
    const options = {
      hostname: 'servicios.simpleapi.cl', // ← CAMBIO: era api.simpleapi.cl
      path: urlPath,
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      }
    };

    const result = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = '';
        
        console.log('Response status code:', response.statusCode);
        console.log('Response headers:', response.headers);
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          console.log('Response body (primeros 500 chars):', data.substring(0, 500));
          
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
        console.error('Request error:', e);
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
