// Vercel Serverless Function - ES Module syntax
import https from 'https';

/**
 * Contexto funcional (evidencia de dos contratos):
 *
 * 1) Contrato histórico (legacy) usado por el CRM en producción:
 *    - POST /api/bhe/listado/recibidas/{mes}/{año} o /{año}
 *    - Body JSON plano:
 *      { RutUsuario, PasswordSII }
 *    - Header Authorization: <apiKey>
 *    - Sin certificado digital en request.
 *
 * 2) Contrato actual documentado por SimpleAPI (cert):
 *    - POST /api/bhe/listado/recibidas/{mes}/{año} o /{año}
 *    - multipart/form-data
 *    - campo "input" (JSON string) con:
 *      { RutCertificado, Password, CertificadoB64? }
 *    - opcional/alternativo: archivo PFX en campo "files"
 *    - Header Authorization: <apiKey>
 *
 * Este handler se deja en modo diagnóstico controlado para comparar
 * comportamiento real del proveedor entre ambos contratos.
 */

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

const buildUrlPath = (mesNum, anioNum) => {
  if (mesNum !== null) {
    const mesPad = String(mesNum).padStart(2, '0');
    return `/api/bhe/listado/recibidas/${mesPad}/${anioNum}`;
  }
  return `/api/bhe/listado/recibidas/${anioNum}`;
};

const extractRemoteErrorMessage = (remoteData) => {
  if (typeof remoteData === 'string') return remoteData;
  return remoteData?.message || remoteData?.error || remoteData?.descripcion || remoteData?.detail || null;
};

const pickRecordArray = (remoteData) => {
  if (Array.isArray(remoteData)) return remoteData;
  if (!remoteData || typeof remoteData !== 'object') return [];

  const candidates = [
    remoteData.boletas,
    remoteData.data,
    remoteData.result,
    remoteData.items,
    remoteData.registros,
    remoteData.documentos
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }

  return [];
};

const buildRecordPreview = (records) => records.slice(0, 3).map((r) => ({
  prestador: r?.emisor?.razonSocial || r?.prestador || null,
  rutEmisor: r?.emisor?.rut || r?.rut || null,
  fecha: r?.encabezado?.fechaBoleta || r?.fecha || r?.fechaEmision || null,
  monto: r?.honorarios?.brutos || r?.monto_bruto_clp || r?.total || null
}));


const requestSimpleApi = ({ urlPath, options, bodyBuffer }) => new Promise((resolve, reject) => {
  const request = https.request(options, (response) => {
    let data = '';

    console.info('[sync-boletas] statusCode respuesta SimpleAPI', { statusCode: response.statusCode });

    response.on('data', (chunk) => {
      data += chunk;
    });

    response.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        resolve({ statusCode: response.statusCode, data: parsed, rawBody: data });
      } catch {
        resolve({ statusCode: response.statusCode, data, rawBody: data });
      }
    });
  });

  request.on('error', (e) => {
    console.error('[sync-boletas] Request error', { message: e.message, urlPath });
    reject(e);
  });

  if (bodyBuffer) request.write(bodyBuffer);
  request.end();
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', method: req.method });
  }

  try {
    const {
      mode,
      apiKey,
      año,
      mes,
      rutUsuario,
      passwordSII,
      passwordCertificado,
      certificadoB64,
      certificadoNombre,
      certificadoMimeType,
      certificadoBuffer
    } = req.body || {};

    const anioNum = Number(año);
    const mesNum = (mes === '' || mes === null || mes === undefined || mes === 'null' || mes === 'undefined') ? null : Number(mes);

    if (!apiKey || !rutUsuario || !Number.isInteger(anioNum) || (mesNum !== null && (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12))) {
      return res.status(400).json({
        error: 'Parámetros inválidos: apiKey, rutUsuario, año numérico y mes opcional (1-12)'
      });
    }

    const certificadoB64Sanitized = typeof certificadoB64 === 'string' ? certificadoB64.trim() : '';
    const hasCertificadoB64 = certificadoB64Sanitized.length > 0;
    const certFileBuffer = toBufferFromUnknown(certificadoBuffer);
    const hasCertificadoFile = Boolean(certFileBuffer && certFileBuffer.length > 0);

    let modeToUse = null;

    // Regla pedida: por mode explícito o por presencia de campos.
    if (mode === 'legacy' || mode === 'cert') {
      modeToUse = mode;
    } else if (passwordCertificado && hasCertificadoB64) {
      modeToUse = 'cert';
    } else if (passwordSII && !hasCertificadoB64 && !hasCertificadoFile) {
      modeToUse = 'legacy';
    }

    if (!modeToUse) {
      return res.status(400).json({
        error: 'No se pudo determinar modo. Envía mode="legacy" o mode="cert", o bien passwordCertificado+certificadoB64 (cert) / passwordSII sin certificado (legacy).'
      });
    }

    const urlPath = buildUrlPath(mesNum, anioNum);

    console.info('[sync-boletas] Request diagnóstico', {
      modeToUse,
      hasApiKey: Boolean(apiKey),
      hasRutUsuario: Boolean(rutUsuario),
      hasPasswordSII: Boolean(passwordSII),
      hasPasswordCertificado: Boolean(passwordCertificado),
      hasCertificadoB64,
      hasCertificadoFile,
      anio: anioNum,
      mes: mesNum,
      urlPath
    });

    let result = null;
    let sentInput = null;

    if (modeToUse === 'legacy') {
      if (!passwordSII) {
        return res.status(400).json({ error: 'En modo legacy, passwordSII es requerido.', mode: 'legacy' });
      }

      // Contrato histórico (JSON plano)
      const legacyPayload = {
        RutUsuario: rutUsuario,
        PasswordSII: passwordSII
      };

      sentInput = {
        RutUsuario: rutUsuario,
        PasswordSII: maskPassword(passwordSII)
      };

      console.info('[sync-boletas] Enviando modo legacy', { urlPath, sentInput });

      const postDataBuffer = Buffer.from(JSON.stringify(legacyPayload), 'utf8');
      const options = {
        hostname: 'servicios.simpleapi.cl',
        path: urlPath,
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
          'Content-Length': postDataBuffer.length
        }
      };

      result = await requestSimpleApi({ urlPath, options, bodyBuffer: postDataBuffer });
    }

    if (modeToUse === 'cert') {
      if (!passwordCertificado) {
        return res.status(400).json({ error: 'En modo cert, passwordCertificado es requerido.', mode: 'cert' });
      }
      if (!hasCertificadoB64 && !hasCertificadoFile) {
        return res.status(400).json({ error: 'Falta certificado digital para modo cert (certificadoB64 o archivo).', mode: 'cert' });
      }

      const inputPayload = {
        RutCertificado: rutUsuario,
        Password: passwordCertificado
      };
      if (hasCertificadoB64) inputPayload.CertificadoB64 = certificadoB64Sanitized;

      sentInput = {
        RutCertificado: rutUsuario,
        Password: maskPassword(passwordCertificado),
        CertificadoB64: hasCertificadoB64 ? '[base64]' : undefined,
        FileAttached: !hasCertificadoB64 && hasCertificadoFile
      };

      console.info('[sync-boletas] Enviando modo cert', {
        urlPath,
        sentInput,
        fileName: !hasCertificadoB64 && hasCertificadoFile ? (certificadoNombre || 'certificado.pfx') : null,
        fileMime: !hasCertificadoB64 && hasCertificadoFile ? (certificadoMimeType || 'application/x-pkcs12') : null
      });

      // Contrato actual documentado (multipart/form-data)
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

      result = await requestSimpleApi({ urlPath, options, bodyBuffer: postDataBuffer });
    }

    if (!result) {
      return res.status(500).json({ error: 'No se pudo ejecutar request de diagnóstico.', mode: modeToUse, urlPath });
    }

    if (result.statusCode !== 200) {
      console.error('[sync-boletas] Error remoto diagnóstico', {
        mode: modeToUse,
        statusCode: result.statusCode,
        urlPath,
        remoteBody: result.rawBody
      });

      const detailMessage = extractRemoteErrorMessage(result.data);
      const records = pickRecordArray(result.data);
      const recordCount = records.length;
      const recordPreview = buildRecordPreview(records);

      return res.status(result.statusCode).json({
        error: detailMessage || 'Error desde SimpleAPI',
        statusCode: result.statusCode,
        details: result.data,
        remoteBody: result.data,
        remoteBodyRaw: result.rawBody,
        urlPath,
        mode: modeToUse,
        recordCount,
        recordPreview,
        sentInput
      });
    }

    // Respuesta diagnóstica pedida (sin tocar inserción en Supabase del frontend)
    const records = pickRecordArray(result.data);
    const recordCount = records.length;
    const recordPreview = buildRecordPreview(records);

    return res.status(200).json({
      mode: modeToUse,
      urlPath,
      statusCode: result.statusCode,
      remoteBody: result.data,
      remoteBodyRaw: result.rawBody,
      recordCount,
      recordPreview,
      body: result.data
    });
  } catch (error) {
    console.error('[sync-boletas] Error interno', { message: error.message });
    return res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message
    });
  }
}
