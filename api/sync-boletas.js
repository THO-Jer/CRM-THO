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
    const { apiKey, año, mes, rutUsuario, passwordSII } = req.body || {};
    const anioNum = Number(año);
    const mesNum = (mes === '' || mes === null || mes === undefined || mes === 'null' || mes === 'undefined') ? null : Number(mes);

    // Log de lo que recibimos
    console.info('[sync-boletas] Request recibida', {
      apiKeyProvided: Boolean(apiKey),
      rutProvided: Boolean(rutUsuario),
      passwordProvided: Boolean(passwordSII),
      anio: anioNum,
      mes: mesNum
    });

    // Validar parámetros requeridos
    if (!apiKey || !rutUsuario || !passwordSII || !Number.isInteger(anioNum) || (mesNum !== null && (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12))) {
      return res.status(400).json({ 
        error: 'Parámetros inválidos: apiKey, rutUsuario, passwordSII, año numérico y mes opcional (1-12)'
      });
    }

    // Determinar si pedir mes específico o todo el año
    let urlPath;
    if (mesNum !== null) {
      const mesPad = String(mesNum).padStart(2, '0');
      urlPath = `/api/bhe/listado/recibidas/${mesPad}/${anioNum}`;
    } else {
      urlPath = `/api/bhe/listado/recibidas/${anioNum}`;
    }
    
    console.info('[sync-boletas] Llamando endpoint SimpleAPI', { anio: anioNum, mes: mesNum, hasMonth: mesNum !== null });
    
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
        'Authorization': apiKey,
        'apikey': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const result = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = '';
        
        console.info('[sync-boletas] Response status', { statusCode: response.statusCode });
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          console.info('[sync-boletas] Response body preview', { preview: data.substring(0, 200) });
          
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
        console.error('[sync-boletas] Request error', { message: e.message });
        reject(e);
      });

      // Enviar el body
      request.write(postData);
      request.end();
    });

    if (result.statusCode !== 200) {
      const detailMessage = typeof result.data === 'string'
        ? result.data
        : (result.data?.message || result.data?.error || result.data?.descripcion || null);

      return res.status(result.statusCode).json({
        error: detailMessage || 'Error desde SimpleAPI',
        statusCode: result.statusCode,
        details: result.data
      });
    }

    return res.status(200).json(result.data);

  } catch (error) {
    console.error('[sync-boletas] Error interno', { message: error.message });
    return res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message
    });
  }
}
