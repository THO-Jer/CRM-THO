export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        const { apiKey, rutUsuario, passwordSII, año, mes } = req.body || {};
        const anioNum = Number(año);
        const mesNum = Number(mes);

        if (!apiKey || !rutUsuario || !passwordSII || !Number.isInteger(anioNum) || !Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) {
            return res.status(400).json({ error: 'Parámetros inválidos: apiKey, rutUsuario, passwordSII, año numérico y mes (1-12)' });
        }

        const simpleApiUrl = 'https://api.simpleapi.cl/api/dte/recibidos/';
        const payload = {
            rut: rutUsuario,
            password: passwordSII,
            anio: anioNum,
            mes: mesNum
        };

        console.info('[sync-facturas-recibidas] Request validada', { anio: anioNum, mes: mesNum, rutProvided: Boolean(rutUsuario) });

        const response = await fetch(simpleApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[sync-facturas-recibidas] Error SimpleAPI', { status: response.status, detailPreview: errorText?.slice?.(0, 200) || '' });
            return res.status(response.status).json({
                error: 'Error desde SimpleAPI',
                details: errorText,
                status: response.status
            });
        }

        const data = await response.json();
        console.info('[sync-facturas-recibidas] Sincronización OK');

        return res.status(200).json(data);

    } catch (error) {
        console.error('[sync-facturas-recibidas] Error interno', { message: error.message });
        return res.status(500).json({
            error: 'Error interno del servidor',
            message: error.message
        });
    }
}
