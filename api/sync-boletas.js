// Vercel Serverless Function - ES Module syntax
import https from 'https';

const maskPassword = (value) => (value ? '***' : '');

const toBufferFromUnknown = (value) => {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return Buffer.from(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return Buffer.from(trimmed, 'base64');
  }
  return null;
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      method: req.method
    });
  }

  try {
    const {
      apiKey,
      año,
      mes,
      rutUsuario,
      passwordCertificado,
      certificadoB64,
      certificadoNombre,
      certificadoMimeType,
      certificadoBuffer
    } = req.body || {};

    const anioNum = Number(año);
    const mesNum = (mes === '' || mes === null || mes === undefined || mes === 'null' || mes === 'undefined') ? null : Number(mes);

    const certificadoB64Sanitized = typeof certificadoB64 === 'string' ? certificadoB64.trim() : '';
    const hasCertificadoB64 = certificadoB64Sanitized.length > 0;
    const certFileBuffer = hasCertificadoB64 ? null : toBufferFromUnknown(certificadoBuffer);
    const hasCertificadoFile = Boolean(certFileBuffer && certFileBuffer.length > 0);

    console.info('[sync-boletas] Body recibido desde frontend', {
      hasApiKey: Boolean(apiKey),
      hasRutUsuario: Boolean(rutUsuario),
      hasPasswordCertificado: Boolean(passwordCertificado),
      anio: anioNum,
      mes: mesNum,
      hasCertificadoB64,
      hasCertificadoFile,
      certificadoNombre: certificadoNombre || null,
      certificadoMimeType: certificadoMimeType || null
    });

    if (!apiKey || !rutUsuario || !passwordCertificado || !Number.isInteger(anioNum) || (mesNum !== null && (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12))) {
      return res.status(400).json({
        error: 'Parámetros inválidos: apiKey, rutUsuario, passwordCertificado, año numérico y mes opcional (1-12)'
      });
    }

    if (!hasCertificadoB64 && !hasCertificadoFile) {
      return res.status(400).json({
        error: 'Falta certificado digital para consultar BHE en SimpleAPI'
      });
    }

    let urlPath;
    if (mesNum !== null) {
      const mesPad = String(mesNum).padStart(2, '0');
      urlPath = `/api/bhe/listado/recibidas/${mesPad}/${anioNum}`;
    } else {
      urlPath = `/api/bhe/listado/recibidas/${anioNum}`;
    }

    const inputPayload = {
      RutCertificado: rutUsuario,
      Password: passwordCertificado
    };

    if (hasCertificadoB64) {
      inputPayload.CertificadoB64 = certificadoB64Sanitized;
    }

    const sentInput = {
      RutCertificado: rutUsuario,
      Password: maskPassword(passwordCertificado),
      CertificadoB64: hasCertificadoB64 ? '[base64]' : undefined
    };

    console.info('[sync-boletas] urlPath final', { urlPath });
    console.info('[sync-boletas] payload enviado a SimpleAPI', {
      input: sentInput,
      adjuntoArchivo: hasCertificadoFile,
      nombreArchivo: hasCertificadoFile ? (certificadoNombre || 'certificado.pfx') : null
    });

    const boundary = `----crm-tho-${Date.now().toString(16)}`;
    const chunks = [];

    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from('Content-Disposition: form-data; name="input"\r\n\r\n'));
    chunks.push(Buffer.from(JSON.stringify(inputPayload), 'utf8'));
    chunks.push(Buffer.from('\r\n'));

    if (!hasCertificadoB64 && hasCertificadoFile) {
      const fileName = certificadoNombre || 'certificado.pfx';
      const fileMime = certificadoMimeType || 'application/x-pkcs12';

      chunks.push(Buffer.from(`--${boundary}\r\n`));
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="files"; filename="${fileName}"\r\n`));
      chunks.push(Buffer.from(`Content-Type: ${fileMime}\r\n\r\n`));
      chunks.push(certFileBuffer);
      chunks.push(Buffer.from('\r\n'));
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`));

    const postDataBuffer = Buffer.concat(chunks);

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
