export default async function handler(req, res) {
    // Configurar CORS
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
        const { apiKey, rutUsuario, passwordSII, año, mes } = req.body;

        if (!apiKey || !rutUsuario || !passwordSII || !año || !mes) {
            return res.status(400).json({ error: 'Faltan parámetros requeridos' });
        }

        // Endpoint de SimpleAPI para facturas recibidas
        const simpleApiUrl = 'https://api.simpleapi.cl/api/dte/recibidos/';
        
        const payload = {
            rut: rutUsuario,
            password: passwordSII,
            anio: parseInt(año),
            mes: parseInt(mes)
        };

        console.log('Llamando a SimpleAPI recibidos:', payload);

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
            console.error('Error SimpleAPI:', response.status, errorText);
            return res.status(response.status).json({ 
                error: 'Error desde SimpleAPI',
                details: errorText,
                status: response.status
            });
        }

        const data = await response.json();
        console.log('Respuesta SimpleAPI:', data);

        return res.status(200).json(data);

    } catch (error) {
        console.error('Error en sync-facturas-recibidas:', error);
        return res.status(500).json({ 
            error: 'Error interno del servidor',
            message: error.message 
        });
    }
}
