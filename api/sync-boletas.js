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
    const { apiKey, año, mes, rutUsuario, passwordSII } = req.body;

    // Log de lo que recibimos
    console.log('=== REQUEST BODY ===');
    console.log('apiKey:', apiKey ? 'presente' : 'FALTA');
    console.log('rutUsuario:', rutUsuario ? 'presente' : 'FALTA');
    console.log('passwordSII:', passwordSII ? 'presente' : 'FALTA');
    console.log('año:', año);
    console.log('mes:', mes);

    // Validar parámetros requeridos
    if (!apiKey || !año || !rutUsuario || !passwordSII) {
      return res.status(400).json({ 
        error: 'Faltan parámetros requeridos: apiKey, año, rutUsuario, passwordSII',
        received: { 
          apiKey: !!apiKey, 
          año: !!año, 
          rutUsuario: !!rutUsuario, 
          passwordSII: !!passwordSII, 
          mes: mes 
        }
      });
    }

    // Determinar si pedir mes específico o todo el año
    let urlPath;
    if (mes && mes !== '' && mes !== 'null' && mes !== 'undefined') {
      const mesPad = String(mes).padStart(2, '0');
      urlPath = `/api/bhe/listado/recibidas/${mesPad}/${año}`;
    } else {
      urlPath = `/api/bhe/listado/recibidas/${año}`;
    }
    
    console.log('=== DEBUG INFO ===');
    console.log('Año:', año);
    console.log('Mes válido:', mes && mes !== '' ? mes : 'NO (traer todo el año)');
    console.log('URL completa:', `https://servicios.simpleapi.cl${urlPath}`);
    
    // Preparar body para SimpleAPI
    const postData = JSON.stringify({
      RutUsuario: rutUsuario,
      PasswordSII: passwordSII
    });
    
    const options = {
      hostname: 'servicios.simpleapi.cl',
      path: urlPath,
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const result = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = '';
        
        console.log('Response status code:', response.statusCode);
        
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

      // Enviar el body
      request.write(postData);
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
