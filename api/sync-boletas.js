// Vercel Serverless Function - ES Module syntax
import https from 'https';

const maskPassword = (value) => (value ? '***' : '');

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

    // Log de request entrante (sin secretos)
    console.info('[sync-boletas] Body recibido desde frontend', {
      hasApiKey: Boolean(apiKey),
      hasRutUsuario: Boolean(rutUsuario),
      hasPasswordSII: Boolean(passwordSII),
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

    const sentInput = {
      RutCertificado: rutUsuario,
      Password: maskPassword(passwordSII)
    };

    console.info('[sync-boletas] urlPath final', { urlPath });
    console.info('[sync-boletas] payload enviado a SimpleAPI', { input: sentInput });

    // SimpleAPI requiere multipart/form-data con campo `input` (JSON string)
    const inputPayload = JSON.stringify({
      RutCertificado: rutUsuario,
      Password: passwordSII
    });

    const boundary = `----crm-tho-${Date.now().toString(16)}`;
    const multipartBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="input"',
      '',
      inputPayload,
      `--${boundary}--`,
      ''
    ].join('\r\n');

    const postDataBuffer = Buffer.from(multipartBody, 'utf8');

    const options = {
      hostname: 'servicios.simpleapi.cl',
      path: urlPath,
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': postDataBuffer.length
      }
    };

    const result = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = '';

        console.info('[sync-boletas] statusCode respuesta SimpleAPI', { statusCode: response.statusCode });

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          if (response.statusCode !== 200) {
            console.error('[sync-boletas] body completo error remoto', {
              statusCode: response.statusCode,
              body: data
            });
          }

          try {
            const parsed = JSON.parse(data);
            resolve({
              statusCode: response.statusCode,
              data: parsed
            });
          } catch (e) {
            resolve({
              statusCode: response.statusCode,
              data,
              parseError: e.message
            });
          }
        });
      });

      request.on('error', (e) => {
        console.error('[sync-boletas] Request error', { message: e.message });
        reject(e);
      });

      request.write(postDataBuffer);
      request.end();
    });

    if (result.statusCode !== 200) {
      const detailMessage = typeof result.data === 'string'
        ? result.data
        : (
            result.data?.message ||
            result.data?.error ||
            result.data?.descripcion ||
            result.data?.detail ||
            null
          );

      return res.status(result.statusCode).json({
        error: detailMessage || 'Error desde SimpleAPI',
        statusCode: result.statusCode,
        details: result.data,
        urlPath,
        sentInput
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
