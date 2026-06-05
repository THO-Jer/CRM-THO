import jsPDF from 'jspdf'

type RgbColor = [number, number, number]

// THO brand colors
const COLORS: Record<string, RgbColor> = {
    naranja:   [235, 131, 52],
    dark:      [33, 33, 33],
    gray:      [120, 120, 120],
    lightGray: [200, 200, 200],
    bg:        [249, 249, 249],
    white:     [255, 255, 255],
    verde:     [56, 142, 60],
}

interface ServiceInfo {
    nombre: string
    descripcion: string
    entregables: string[]
    plazo: string
}

const SERVICE_CATALOG: Record<string, ServiceInfo> = {
    'Ticket RC Express': {
        nombre: 'Relacionamiento Comunitario Express',
        descripcion: 'Diagnóstico rápido de relacionamiento comunitario que permite identificar stakeholders clave, mapear conflictos actuales y generar un plan de acción priorizado en un plazo corto.',
        entregables: ['Mapeo de stakeholders', 'Diagnóstico de percepciones', 'Plan de acción priorizado', 'Informe ejecutivo'],
        plazo: '2-4 semanas'
    },
    'Ticket Diag Org': {
        nombre: 'Diagnóstico Organizacional',
        descripcion: 'Evaluación integral de la cultura, clima y estructura organizacional mediante metodologías participativas, generando hallazgos accionables y un plan de desarrollo.',
        entregables: ['Encuestas y entrevistas', 'Análisis organizacional', 'Hallazgos y oportunidades', 'Plan de desarrollo organizacional'],
        plazo: '4-6 semanas'
    },
    'Ticket ESG': {
        nombre: 'Diagnóstico ESG',
        descripcion: 'Evaluación de desempeño en criterios Ambientales, Sociales y de Gobernanza (ESG) adaptada a la realidad de la organización, con roadmap de mejora.',
        entregables: ['Evaluación ESG baseline', 'Benchmark sectorial', 'Roadmap de mejora', 'Indicadores de seguimiento'],
        plazo: '4-8 semanas'
    },
    'Key Account Nivel 1': {
        nombre: 'Relacionamiento Comunitario Nivel 1',
        descripcion: 'Servicio mensual de gestión de relacionamiento comunitario que incluye monitoreo de stakeholders, facilitación de espacios de diálogo y reportería periódica.',
        entregables: ['Gestión mensual de stakeholders', 'Facilitación de reuniones', 'Reportes mensuales', 'Alertas y recomendaciones'],
        plazo: 'Servicio mensual continuo'
    },
    'Key Account Nivel 2': {
        nombre: 'Relacionamiento Comunitario Nivel 2',
        descripcion: 'Servicio integral de relacionamiento comunitario con mayor profundidad: incluye diseño de estrategia participativa, facilitación de procesos multiactor y acompañamiento a equipo interno.',
        entregables: ['Estrategia de RC', 'Facilitación multiactor', 'Capacitación de equipo interno', 'Dashboard de indicadores', 'Reportes mensuales'],
        plazo: 'Servicio mensual continuo'
    },
    'Key Account Nivel 3': {
        nombre: 'Relacionamiento Comunitario Nivel 3',
        descripcion: 'Servicio premium de gestión integral del relacionamiento comunitario con dedicación exclusiva, incluyendo diseño estratégico, ejecución de actividades, monitoreo continuo y asesoría directa a la dirección.',
        entregables: ['Estrategia integral de RC', 'Ejecución de plan de actividades', 'Monitoreo en tiempo real', 'Asesoría directa a dirección', 'Dashboard personalizado', 'Informes ejecutivos mensuales'],
        plazo: 'Servicio mensual continuo'
    },
    'Gestión de Contenido': {
        nombre: 'Gestión de Contenidos',
        descripcion: 'Servicio de creación y gestión de contenidos estratégicos para redes sociales, sitio web y comunicaciones internas, alineados con la identidad y objetivos de la organización.',
        entregables: ['Estrategia de contenidos', 'Calendario editorial', 'Creación de piezas gráficas y audiovisuales', 'Gestión de RRSS', 'Reportes de métricas'],
        plazo: 'Servicio mensual continuo'
    }
}

interface GenerateProposalParams {
    organizacion: string
    contacto?: string | null
    tipo: string
    valor: number | string
    moneda?: 'UF' | 'CLP'
    ufActual?: number
    notas?: string | null
    fecha?: string
}

export function generateProposal({
    organizacion, contacto, tipo, valor,
    moneda = 'UF', ufActual, notas, fecha
}: GenerateProposalParams): string {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210, H = 297
    const ML = 25, MR = 25
    const CW = W - ML - MR
    let y = 0

    const service: ServiceInfo = SERVICE_CATALOG[tipo] || {
        nombre: tipo,
        descripcion: 'Servicio de consultoría especializada adaptado a las necesidades de su organización.',
        entregables: ['Diagnóstico inicial', 'Plan de trabajo', 'Ejecución', 'Informe final'],
        plazo: 'A convenir'
    }

    const fechaHoy = fecha || new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    const valorNum = parseFloat(String(valor)) || 0
    const valorCLP = moneda === 'UF' ? Math.round(valorNum * (ufActual || 38000)) : valorNum
    const valorUF = moneda === 'CLP' ? Math.round(valorNum / (ufActual || 38000) * 100) / 100 : valorNum

    const setColor = (c: RgbColor) => doc.setTextColor(c[0], c[1], c[2])
    const setFill  = (c: RgbColor) => doc.setFillColor(c[0], c[1], c[2])
    const setDraw  = (c: RgbColor) => doc.setDrawColor(c[0], c[1], c[2])

    // ========== PÁGINA 1: PORTADA ==========
    setFill(COLORS.naranja); doc.rect(0, 0, W, 65, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(28); setColor(COLORS.white)
    doc.text('THE HUMAN ORG', ML, 30)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
    doc.text('Consultoría en Desarrollo Organizacional y Comunitario', ML, 40)

    y = 95
    doc.setFont('helvetica', 'bold'); doc.setFontSize(32); setColor(COLORS.dark)
    doc.text('Propuesta de Servicio', ML, y)
    y += 18; doc.setFontSize(18); setColor(COLORS.naranja); doc.text(service.nombre, ML, y)
    y += 12; setDraw(COLORS.naranja); doc.setLineWidth(0.8); doc.line(ML, y, ML + 60, y)
    y += 20; doc.setFontSize(12); setColor(COLORS.gray); doc.setFont('helvetica', 'normal')
    doc.text('Preparada para:', ML, y)
    y += 10; doc.setFontSize(20); doc.setFont('helvetica', 'bold'); setColor(COLORS.dark)
    doc.text(organizacion || 'Cliente', ML, y)
    if (contacto) {
        y += 10; doc.setFontSize(12); doc.setFont('helvetica', 'normal'); setColor(COLORS.gray)
        doc.text(`Atención: ${contacto}`, ML, y)
    }
    y += 20; doc.setFontSize(11); setColor(COLORS.gray); doc.text(fechaHoy, ML, y)

    setFill(COLORS.dark); doc.rect(0, H - 20, W, 20, 'F')
    doc.setFontSize(8); setColor(COLORS.lightGray)
    doc.text('The Human Org SpA  ·  tho.cl  ·  hola@tho.cl', W / 2, H - 8, { align: 'center' })

    // ========== PÁGINA 2: DESCRIPCIÓN + ENTREGABLES ==========
    doc.addPage(); y = 30
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); setColor(COLORS.naranja)
    doc.text('1. Descripción del Servicio', ML, y); y += 3
    setDraw(COLORS.naranja); doc.setLineWidth(0.5); doc.line(ML, y, ML + 50, y); y += 10
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); setColor(COLORS.dark)
    const descLines = doc.splitTextToSize(service.descripcion, CW)
    doc.text(descLines, ML, y); y += descLines.length * 5 + 5

    if (notas) {
        y += 5
        const notasLines = doc.splitTextToSize(notas, CW)
        setColor(COLORS.gray); doc.text(notasLines, ML, y); y += notasLines.length * 5 + 5
    }

    y += 10; doc.setFont('helvetica', 'bold'); doc.setFontSize(14); setColor(COLORS.naranja)
    doc.text('2. Entregables', ML, y); y += 3; doc.line(ML, y, ML + 50, y); y += 10

    service.entregables.forEach((ent, i) => {
        setFill(i % 2 === 0 ? COLORS.bg : COLORS.white)
        doc.roundedRect(ML, y - 4, CW, 10, 2, 2, 'F')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setColor(COLORS.naranja)
        doc.text(`${String(i + 1).padStart(2, '0')}`, ML + 4, y + 2)
        doc.setFont('helvetica', 'normal'); setColor(COLORS.dark); doc.text(ent, ML + 16, y + 2)
        y += 12
    })

    y += 10; doc.setFont('helvetica', 'bold'); doc.setFontSize(14); setColor(COLORS.naranja)
    doc.text('3. Plazo de Ejecución', ML, y); y += 3; doc.line(ML, y, ML + 50, y); y += 10
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); setColor(COLORS.dark)
    doc.text(service.plazo, ML, y)

    // ========== PÁGINA 3: INVERSIÓN + CONDICIONES ==========
    doc.addPage(); y = 30
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); setColor(COLORS.naranja)
    doc.text('4. Inversión', ML, y); y += 3; doc.line(ML, y, ML + 50, y); y += 15

    setFill([255, 248, 240] as RgbColor); setDraw(COLORS.naranja); doc.setLineWidth(0.3)
    doc.roundedRect(ML, y - 5, CW, 40, 3, 3, 'FD')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(28); setColor(COLORS.naranja)
    const tipoSafe = String(tipo || '')
    const isRecurrente = tipoSafe.startsWith('Key Account') || tipoSafe === 'Gestión de Contenido'
    const valorUFFmt = Number(valorUF).toLocaleString('es-CL', { maximumFractionDigits: 2 })
    doc.text(isRecurrente ? `${valorUFFmt} UF /mes` : `${valorUFFmt} UF`, ML + 10, y + 12)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); setColor(COLORS.gray)
    doc.text(`Equivalente aprox. $${valorCLP.toLocaleString('es-CL')} CLP (UF del día: $${(ufActual || 38000).toLocaleString('es-CL')})`, ML + 10, y + 24)
    doc.text(
        isRecurrente
            ? 'Facturación mensual. Valores en UF, no sujetos a variación CLP.'
            : 'Valores en UF, no sujetos a variación CLP. Facturación al inicio del servicio.',
        ML + 10, y + 31
    )
    y += 50

    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); setColor(COLORS.naranja)
    doc.text('5. Condiciones Generales', ML, y); y += 3; doc.line(ML, y, ML + 50, y); y += 10

    const condiciones = [
        'Esta propuesta tiene una vigencia de 30 días corridos desde su fecha de emisión.',
        'Los valores expresados en UF se convierten a pesos chilenos al momento de facturación según el valor UF del día.',
        'THO emitirá factura afecta a IVA (19%) por los montos indicados.',
        isRecurrente
            ? 'El servicio se contrata por un período mínimo de 3 meses, renovable automáticamente salvo aviso con 30 días de anticipación.'
            : 'El plazo de ejecución comienza desde la aprobación formal de la propuesta y pago del anticipo correspondiente.',
        'La información compartida durante el servicio será tratada con estricta confidencialidad.',
    ]

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setColor(COLORS.dark)
    condiciones.forEach((cond, i) => {
        const lines = doc.splitTextToSize(cond, CW - 10)
        doc.text(`${i + 1}.`, ML + 2, y); doc.text(lines, ML + 10, y)
        y += lines.length * 4.5 + 4
    })

    y += 15; doc.setFont('helvetica', 'bold'); doc.setFontSize(14); setColor(COLORS.naranja)
    doc.text('6. Contacto', ML, y); y += 3; doc.line(ML, y, ML + 50, y); y += 12
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); setColor(COLORS.dark)
    doc.text('The Human Org SpA', ML, y); y += 6; setColor(COLORS.gray)
    doc.text('hola@tho.cl  ·  tho.cl', ML, y); y += 6; doc.text('Concepción, Chile', ML, y)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalPages = (doc.internal as any).getNumberOfPages()
    for (let i = 2; i <= totalPages; i++) {
        doc.setPage(i); setFill(COLORS.dark); doc.rect(0, H - 12, W, 12, 'F')
        doc.setFontSize(7); setColor(COLORS.lightGray)
        doc.text('The Human Org SpA  ·  tho.cl', ML, H - 4)
        doc.text(`${i} / ${totalPages}`, W - MR, H - 4, { align: 'right' })
    }

    const safeOrg = (organizacion || 'cliente').replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '') || 'cliente'
    const filename = `Propuesta_THO_${safeOrg}_${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(filename)
    return filename
}

export { SERVICE_CATALOG }
