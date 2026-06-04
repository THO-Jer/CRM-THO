/**
 * parseLiquidacionPDF
 * Extrae los campos de una liquidación de sueldo chilena desde un PDF de texto.
 * Compatible con el formato estándar que emite la contadora de THO.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfjsLib = any

let pdfjsLib: PdfjsLib | null = null

async function getPdfjs(): Promise<PdfjsLib> {
    if (pdfjsLib) return pdfjsLib
    // Importación dinámica para no bloquear el bundle principal
    const lib = await import('pdfjs-dist')
    // Worker necesario para pdfjs — usa el CDN para evitar problemas de bundling
    lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.mjs`
    pdfjsLib = lib
    return lib
}

/** Extrae todo el texto de un PDF como string plano */
async function extractTextFromPDF(file: File): Promise<string> {
    const lib = await getPdfjs()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await lib.getDocument({ data: arrayBuffer }).promise
    const parts: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((item: any) => ('str' in item ? item.str : ''))
            .join(' ')
        parts.push(pageText)
    }
    return parts.join('\n')
}

/** Convierte "600.825" o "40.120,20" al número correspondiente */
function parseNum(raw: string): number {
    if (!raw) return 0
    // Formato chileno: puntos como separador de miles, coma como decimal
    const cleaned = raw.replace(/\./g, '').replace(',', '.')
    return parseFloat(cleaned) || 0
}

/** Mapea nombre de mes en español al número (0-indexed) */
const MESES: Record<string, number> = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
}

export interface LiquidacionParseada {
    trabajador: string
    rut_trabajador: string
    periodo: string          // 'YYYY-MM-DD'
    uf_dia: number
    sueldo_base: number
    gratificacion: number
    colacion: number
    movilizacion: number
    otros_haberes: number
    nombre_afp: string
    afp_trabajador: number
    sistema_salud: string
    salud_trabajador: number
    afc_trabajador: number
    impuesto_unico: number
    otros_descuentos: number
    afp_empleador: number
    afc_empleador: number
    seguro_accidentes: number
    estado: string
    notas: string
}

export async function parseLiquidacionPDF(file: File): Promise<LiquidacionParseada> {
    const text = await extractTextFromPDF(file)

    // ── Trabajador ────────────────────────────────────────────────────────────
    // "Trabajador : ARAYA CANCINO SEBASTIAN ALEJANDRO RUT : 19.090.903-4"
    const trabajadorMatch = text.match(/Trabajador\s*[:：]\s*([A-ZÁÉÍÓÚÑ ]+?)\s+RUT\s*[:：]\s*([\d.\-kK]+)/i)
    const trabajador = trabajadorMatch
        ? trabajadorMatch[1].trim().split(/\s+/).map(w => w[0] + w.slice(1).toLowerCase()).join(' ')
        : ''
    const rut_trabajador = trabajadorMatch ? trabajadorMatch[2].trim() : ''

    // ── Período ───────────────────────────────────────────────────────────────
    // "Liquidación de Sueldo del mes de del ABRIL 2026"
    // o "Liquidación de Sueldo del mes de ABRIL 2026"
    const periodoMatch = text.match(/mes\s+de\s+(?:del\s+)?([A-ZÁÉÍÓÚ]+)\s+(\d{4})/i)
    let periodo = new Date().toISOString().split('T')[0]
    if (periodoMatch) {
        const mesNombre = periodoMatch[1].toLowerCase()
        const año = parseInt(periodoMatch[2])
        const mesNum = MESES[mesNombre]
        if (mesNum !== undefined && !isNaN(año)) {
            periodo = `${año}-${String(mesNum + 1).padStart(2, '0')}-01`
        }
    }

    // ── Valor UF ──────────────────────────────────────────────────────────────
    // "Valor UF : 40.120,20"
    const ufMatch = text.match(/Valor\s+UF\s*[:：]\s*([\d.,]+)/i)
    const uf_dia = ufMatch ? parseNum(ufMatch[1]) : 0

    // ── Sueldo Base ───────────────────────────────────────────────────────────
    // "Sueldo Base 600.825" o "Sueldo Base  600.825"
    const sueldoMatch = text.match(/Sueldo\s+Base\s+([\d.]+)/i)
    const sueldo_base = sueldoMatch ? parseNum(sueldoMatch[1]) : 0

    // ── Gratificación ─────────────────────────────────────────────────────────
    // "Gratificacion Legal 150.206"
    const gratMatch = text.match(/Gratificaci[oó]n\s+(?:Legal|Mensual|Garantizada)?\s*([\d.]+)/i)
    const gratificacion = gratMatch ? parseNum(gratMatch[1]) : 0

    // ── Colación ──────────────────────────────────────────────────────────────
    const colacionMatch = text.match(/Colaci[oó]n\s+([\d.]+)/i)
    const colacion = colacionMatch ? parseNum(colacionMatch[1]) : 0

    // ── Movilización ─────────────────────────────────────────────────────────
    const movilMatch = text.match(/Movilizaci[oó]n\s+([\d.]+)/i)
    const movilizacion = movilMatch ? parseNum(movilMatch[1]) : 0

    // ── AFP ───────────────────────────────────────────────────────────────────
    // "10,58% Prevision MODELO 79.459"
    const afpMatch = text.match(/[\d.,]+%\s+Previsi[oó]n\s+([A-ZÁÉÍÓÚ]+)\s+([\d.]+)/i)
    const nombre_afp = afpMatch ? afpMatch[1].trim() : ''
    const afp_trabajador = afpMatch ? parseNum(afpMatch[2]) : 0

    // ── Salud ─────────────────────────────────────────────────────────────────
    // "Salud FONASA 52.572" o "Salud ISAPRE COLMENA 52.572"
    const saludMatch = text.match(/Salud\s+((?:FONASA|ISAPRE\s+\w+|\w+))\s+([\d.]+)/i)
    const sistema_salud = saludMatch ? saludMatch[1].trim().toUpperCase() : ''
    const salud_trabajador = saludMatch ? parseNum(saludMatch[2]) : 0

    // ── AFC trabajador ────────────────────────────────────────────────────────
    // "Seg. Cesantia 1.234" o "AFC Trabajador 1.234"
    const afcTrabMatch = text.match(/(?:Seg\.?\s*Cesant[íi]a|AFC\s*Trab(?:ajador)?)\s+([\d.]+)/i)
    const afc_trabajador = afcTrabMatch ? parseNum(afcTrabMatch[1]) : 0

    // ── Impuesto Único ────────────────────────────────────────────────────────
    const impMatch = text.match(/Impuesto\s+[ÚU]nico\s+([\d.]+)/i)
    const impuesto_unico = impMatch ? parseNum(impMatch[1]) : 0

    return {
        trabajador,
        rut_trabajador,
        periodo,
        uf_dia,
        sueldo_base,
        gratificacion,
        colacion,
        movilizacion,
        otros_haberes: 0,
        nombre_afp,
        afp_trabajador,
        sistema_salud,
        salud_trabajador,
        afc_trabajador,
        impuesto_unico,
        otros_descuentos: 0,
        // Cotizaciones empleador — no aparecen en la liquidación del trabajador
        afp_empleador: 0,
        afc_empleador: 0,
        seguro_accidentes: 0,
        estado: 'Pagada',
        notas: '',
    }
}
