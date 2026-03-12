import https from 'https';

const maskPassword = (v) => (v ? '***' : '');

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

const requestSimpleApi = ({ options, bodyBuffer }) => new Promise((resolve, reject) => {
  const request = https.request(options, (response) => {
    let data = '';
    response.on('data', (chunk) => { data += chunk; });
    response.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        resolve({ statusCode: response.statusCode, data: parsed, rawBody: data });
      } catch {
        resolve({ statusCode: response.statusCode, data, rawBody: data });
      }
    });
  });

  request.on('error', (e) => reject(e));
  if (bodyBuffer) request.write(bodyBuffer);
  request.end();
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const {
      apiKey,
      rutCertificado,
      rutEmpresa,
      passwordCertificado,
      ambiente = 1,
      procesaBoletas,
      año,
      mes,
      certificadoB64,
      certificadoNombre,
      certificadoMimeType,
      certificadoBuffer,
      mode
    } = req.body || {};

    const anioNum = Number(año);
    const mesNum = Number(mes);
    const ambienteNum = Number(ambiente || 1);
    const certB64 = typeof certificadoB64 === 'string' ? certificadoB64.trim() : '';
    const certFileBuffer = certB64 ? null : toBufferFromUnknown(certificadoBuffer);

    if (!apiKey || !rutCertificado || !rutEmpresa || !passwordCertificado || !Number.isInteger(anioNum) || !Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12 || ![0,1].includes(ambienteNum)) {
      return res.status(400).json({
        error: 'Parámetros inválidos: apiKey, rutCertificado, rutEmpresa, passwordCertificado, ambiente(0|1), año y mes(1-12)',
        statusCode: 400,
        urlPath: null,
        mode: mode || 'cert-rcv',
        details: null,
        sentInput: null
      });
    }

    if (!certB64 && !(certFileBuffer && certFileBuffer.length > 0)) {
      return res.status(400).json({
        error: 'Falta certificado digital (certificadoB64 o archivo) para RCV ventas',
        statusCode: 400,
        urlPath: null,
        mode: mode || 'cert-rcv',
        details: null,
        sentInput: null
      });
    }

    const mesPad = String(mesNum).padStart(2, '0');
    const urlPath = `/api/RCV/ventas/${mesPad}/${anioNum}`;

    const inputPayload = {
      RutCertificado: rutCertificado,
      RutEmpresa: rutEmpresa,
      Ambiente: ambienteNum,
      Password: passwordCertificado
    };

    if (typeof procesaBoletas !== 'undefined') {
      inputPayload.ProcesaBoletas = Boolean(procesaBoletas);
    }
    if (certB64) inputPayload.CertificadoB64 = certB64;

    const sentInput = {
      RutCertificado: rutCertificado,
      RutEmpresa: rutEmpresa,
      Ambiente: ambienteNum,
      Password: maskPassword(passwordCertificado),
      ProcesaBoletas: typeof procesaBoletas !== 'undefined' ? Boolean(procesaBoletas) : undefined,
      CertificadoB64: certB64 ? '[base64]' : undefined,
      FileAttached: !certB64 && Boolean(certFileBuffer)
    };

    const boundary = `----crm-tho-rcv-ventas-${Date.now().toString(16)}`;
    const chunks = [];

    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from('Content-Disposition: form-data; name="input"\r\n\r\n'));
    chunks.push(Buffer.from(JSON.stringify(inputPayload), 'utf8'));
    chunks.push(Buffer.from('\r\n'));

    if (!certB64 && certFileBuffer) {
      const fileName = certificadoNombre || 'certificado.pfx';
      const fileMime = certificadoMimeType || 'application/x-pkcs12';
      chunks.push(Buffer.from(`--${boundary}\r\n`));
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="files"; filename="${fileName}"\r\n`));
      chunks.push(Buffer.from(`Content-Type: ${fileMime}\r\n\r\n`));
      chunks.push(certFileBuffer);
      chunks.push(Buffer.from('\r\n'));
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`));

    const bodyBuffer = Buffer.concat(chunks);
    const options = {
      hostname: 'servicios.simpleapi.cl',
      path: urlPath,
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length
      }
    };

    const result = await requestSimpleApi({ options, bodyBuffer });

    if (result.statusCode !== 200) {
      return res.status(result.statusCode).json({
        error: (typeof result.data === 'string' ? result.data : (result.data?.message || result.data?.error || 'Error desde SimpleAPI')),
        statusCode: result.statusCode,
        details: result.data,
        urlPath,
        mode: mode || 'cert-rcv',
        sentInput
      });
    }

    return res.status(200).json({
      statusCode: result.statusCode,
      details: result.data,
      urlPath,
      mode: mode || 'cert-rcv',
      sentInput
    });

  } catch (error) {
    return res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message,
      statusCode: 500,
      details: null,
      urlPath: null,
      mode: 'cert-rcv',
      sentInput: null
    });
  }
}
