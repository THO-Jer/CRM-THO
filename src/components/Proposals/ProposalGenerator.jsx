import { useState } from 'react'
import { jsPDF } from 'jspdf'

const servicioDefaults = {
  'Ticket RC Express': { descripcion: 'Diagnóstico rápido de relacionamiento comunitario con entregables ejecutivos en un plazo de 2-3 semanas.', entregables: ['Informe diagnóstico RC Express', 'Mapa de actores clave', 'Recomendaciones accionables'], plazo: '2-3 semanas' },
  'Ticket Diag Org': { descripcion: 'Diagnóstico organizacional integral que evalúa cultura, estructura, procesos y liderazgo para identificar oportunidades de mejora.', entregables: ['Informe diagnóstico organizacional', 'Análisis FODA organizacional', 'Plan de acción con quick wins'], plazo: '4-6 semanas' },
  'Ticket ESG': { descripcion: 'Evaluación de desempeño en criterios Ambientales, Sociales y de Gobernanza con roadmap de mejora.', entregables: ['Reporte ESG baseline', 'Gap analysis normativo', 'Roadmap de mejora ESG'], plazo: '6-8 semanas' },
  'Key Account Nivel 1': { descripcion: 'Acompañamiento mensual en relacionamiento comunitario con sesiones de coordinación y reportería periódica.', entregables: ['Sesiones mensuales de coordinación', 'Reportes trimestrales de avance', 'Acceso a red de contactos THO'], plazo: 'Contrato anual renovable' },
  'Key Account Nivel 2': { descripcion: 'Gestión integral de relacionamiento comunitario con presencia en terreno, facilitación de espacios y reportería ejecutiva.', entregables: ['Todo Nivel 1', 'Facilitación de talleres/reuniones', 'Gestión de stakeholders en terreno', 'Informes mensuales ejecutivos'], plazo: 'Contrato anual renovable' },
  'Key Account Nivel 3': { descripcion: 'Servicio premium de relacionamiento comunitario con dedicación preferente, estrategia a medida y acompañamiento permanente.', entregables: ['Todo Nivel 2', 'Estrategia RC personalizada', 'Dedicación preferente del equipo', 'Reportes ejecutivos semanales', 'Gestión de crisis'], plazo: 'Contrato anual renovable' },
  'Gestión de Contenido': { descripcion: 'Producción y gestión de contenido audiovisual y digital para comunicación organizacional y comunitaria.', entregables: ['Producción audiovisual mensual', 'Gestión de redes sociales', 'Diseño de piezas gráficas', 'Calendario editorial'], plazo: 'Contrato mensual/trimestral' },
};

export default function ProposalGenerator({ prospecto, onClose, ufActual }) {
  const defaults = servicioDefaults[prospecto?.tipo] || servicioDefaults['Ticket RC Express'];
  
  const [form, setForm] = useState({
    cliente: prospecto?.organizacion || '',
    contacto: prospecto?.contacto || '',
    tipo: prospecto?.tipo || 'Ticket RC Express',
    descripcion: defaults.descripcion,
    entregables: defaults.entregables.join('\n'),
    plazo: defaults.plazo,
    valor_uf: prospecto?.valor || '',
    condiciones_pago: 'Orden de compra',
    validez: '30 días',
    fecha: new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }),
    nota_adicional: '',
  });

  const updateTipo = (tipo) => {
    const d = servicioDefaults[tipo] || defaults;
    setForm(prev => ({ ...prev, tipo, descripcion: d.descripcion, entregables: d.entregables.join('\n'), plazo: d.plazo }));
  };

  const generatePDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const margin = 25;
    const contentW = W - margin * 2;
    let y = margin;

    // Helper functions
    const addText = (text, x, yPos, options = {}) => {
      const { size = 10, style = 'normal', color = [51, 51, 51], align = 'left', maxWidth = contentW } = options;
      doc.setFontSize(size);
      doc.setFont('helvetica', style);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, x, yPos, { align });
      return lines.length * size * 0.4;
    };

    const addLine = (yPos, color = [230, 230, 230]) => {
      doc.setDrawColor(...color);
      doc.setLineWidth(0.3);
      doc.line(margin, yPos, W - margin, yPos);
    };

    const checkPage = (needed) => {
      if (y + needed > H - 30) { doc.addPage(); y = margin; }
    };

    // === HEADER ===
    // Orange accent bar
    doc.setFillColor(255, 107, 53); // naranja THO
    doc.rect(0, 0, W, 8, 'F');

    // Logo text
    y = 22;
    addText('THO', margin, y, { size: 28, style: 'bold', color: [255, 107, 53] });
    addText('The Human Org', margin + 28, y, { size: 12, style: 'normal', color: [120, 120, 120] });
    
    y += 8;
    addText('Desarrollo Organizacional · Relacionamiento Comunitario', margin, y, { size: 8, color: [150, 150, 150] });

    // Date and reference - right aligned
    addText(form.fecha, W - margin, 22, { size: 9, color: [120, 120, 120], align: 'right' });
    addText(`Ref: COT-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`, W - margin, 28, { size: 8, color: [150, 150, 150], align: 'right' });

    // Separator
    y += 6;
    addLine(y, [255, 107, 53]);

    // === CLIENT INFO ===
    y += 10;
    addText('PROPUESTA DE SERVICIO', margin, y, { size: 14, style: 'bold', color: [33, 33, 33] });
    y += 10;
    
    // Client box
    doc.setFillColor(249, 249, 249);
    doc.roundedRect(margin, y - 4, contentW, 22, 3, 3, 'F');
    addText('Para:', margin + 5, y + 2, { size: 8, color: [120, 120, 120] });
    addText(form.cliente, margin + 5, y + 8, { size: 12, style: 'bold', color: [33, 33, 33] });
    if (form.contacto) addText(`Attn: ${form.contacto}`, margin + 5, y + 14, { size: 9, color: [100, 100, 100] });
    
    // === SERVICE SECTION ===
    y += 30;
    checkPage(50);
    
    // Section header with orange accent
    doc.setFillColor(255, 107, 53);
    doc.rect(margin, y - 2, 3, 8, 'F');
    addText('SERVICIO', margin + 8, y + 3, { size: 10, style: 'bold', color: [255, 107, 53] });
    y += 12;

    addText(form.tipo, margin, y, { size: 13, style: 'bold', color: [33, 33, 33] });
    y += 9;

    const descLines = doc.splitTextToSize(form.descripcion, contentW);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text(descLines, margin, y);
    y += descLines.length * 4.5 + 4;

    // === DELIVERABLES ===
    checkPage(40);
    doc.setFillColor(255, 107, 53);
    doc.rect(margin, y - 2, 3, 8, 'F');
    addText('ENTREGABLES', margin + 8, y + 3, { size: 10, style: 'bold', color: [255, 107, 53] });
    y += 14;

    form.entregables.split('\n').filter(e => e.trim()).forEach((entregable, i) => {
      checkPage(8);
      doc.setFillColor(255, 237, 227);
      doc.circle(margin + 3, y - 1, 1.5, 'F');
      addText(entregable.trim(), margin + 9, y, { size: 10, color: [60, 60, 60] });
      y += 7;
    });

    // === TERMS BOX ===
    y += 6;
    checkPage(45);
    doc.setFillColor(255, 107, 53);
    doc.rect(margin, y - 2, 3, 8, 'F');
    addText('CONDICIONES', margin + 8, y + 3, { size: 10, style: 'bold', color: [255, 107, 53] });
    y += 14;

    // Terms grid
    doc.setFillColor(249, 249, 249);
    doc.roundedRect(margin, y - 4, contentW, 32, 3, 3, 'F');
    
    const colW = contentW / 3;
    const terms = [
      { label: 'Plazo', value: form.plazo },
      { label: 'Condiciones de pago', value: form.condiciones_pago },
      { label: 'Validez cotización', value: form.validez },
    ];
    terms.forEach((t, i) => {
      const x = margin + 5 + (i * colW);
      addText(t.label, x, y + 2, { size: 8, color: [120, 120, 120] });
      addText(t.value, x, y + 8, { size: 10, style: 'bold', color: [33, 33, 33] });
    });

    // === PRICE BOX ===
    y += 38;
    checkPage(35);

    const valorCLP = Math.round((parseFloat(form.valor_uf) || 0) * (ufActual || 38000));
    
    doc.setFillColor(255, 107, 53);
    doc.roundedRect(margin, y - 4, contentW, 28, 3, 3, 'F');
    
    addText('INVERSIÓN', margin + 8, y + 3, { size: 9, style: 'bold', color: [255, 255, 255] });
    addText(`${form.valor_uf} UF`, margin + 8, y + 14, { size: 22, style: 'bold', color: [255, 255, 255] });
    addText(`$${valorCLP.toLocaleString('es-CL')} + IVA`, W - margin - 8, y + 14, { size: 11, color: [255, 220, 200], align: 'right' });
    addText(`(UF al ${form.fecha}: $${(ufActual || 38000).toLocaleString('es-CL')})`, W - margin - 8, y + 20, { size: 7, color: [255, 200, 180], align: 'right' });

    // === ADDITIONAL NOTES ===
    if (form.nota_adicional.trim()) {
      y += 36;
      checkPage(20);
      addText('Nota:', margin, y, { size: 9, style: 'italic', color: [120, 120, 120] });
      y += 5;
      const noteLines = doc.splitTextToSize(form.nota_adicional, contentW);
      doc.setFontSize(9); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100);
      doc.text(noteLines, margin, y);
    }

    // === FOOTER ===
    const footerY = H - 18;
    addLine(footerY - 4, [220, 220, 220]);
    addText('THO — The Human Org SpA', margin, footerY, { size: 8, color: [150, 150, 150] });
    addText('tho.cl · contacto@tho.cl', W / 2, footerY, { size: 8, color: [150, 150, 150], align: 'center' });
    addText('Concepción, Chile', W - margin, footerY, { size: 8, color: [150, 150, 150], align: 'right' });

    // Bottom bar
    doc.setFillColor(255, 107, 53);
    doc.rect(0, H - 5, W, 5, 'F');

    // Save
    const filename = `Propuesta_THO_${form.cliente.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
  };

  const cls = "w-full px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-naranja";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-6" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">📄 Generar Propuesta PDF</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{form.cliente}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg transition">✕</button>
          </div>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">Cliente</label>
              <input value={form.cliente} onChange={e => setForm(prev => ({...prev, cliente: e.target.value}))} className={cls} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">Contacto</label>
              <input value={form.contacto} onChange={e => setForm(prev => ({...prev, contacto: e.target.value}))} className={cls} />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">Tipo de Servicio</label>
            <select value={form.tipo} onChange={e => updateTipo(e.target.value)} className={cls}>
              {Object.keys(servicioDefaults).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">Descripción del Servicio</label>
            <textarea value={form.descripcion} onChange={e => setForm(prev => ({...prev, descripcion: e.target.value}))} rows={3} className={cls + ' resize-none'} />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">Entregables (uno por línea)</label>
            <textarea value={form.entregables} onChange={e => setForm(prev => ({...prev, entregables: e.target.value}))} rows={4} className={cls + ' resize-none'} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">Valor (UF)</label>
              <input type="number" step="0.01" value={form.valor_uf} onChange={e => setForm(prev => ({...prev, valor_uf: e.target.value}))} className={cls} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">Plazo</label>
              <input value={form.plazo} onChange={e => setForm(prev => ({...prev, plazo: e.target.value}))} className={cls} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">Pago</label>
              <select value={form.condiciones_pago} onChange={e => setForm(prev => ({...prev, condiciones_pago: e.target.value}))} className={cls}>
                <option>Orden de compra</option>
                <option>Transferencia</option>
                <option>Factura 30 días</option>
                <option>50% anticipo + 50% entrega</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">Validez</label>
              <select value={form.validez} onChange={e => setForm(prev => ({...prev, validez: e.target.value}))} className={cls}>
                <option>15 días</option>
                <option>30 días</option>
                <option>45 días</option>
                <option>60 días</option>
              </select>
            </div>
          </div>

          {form.valor_uf && (
            <div className="bg-naranja/10 rounded-lg p-3 flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Equivalente CLP:</span>
              <span className="font-bold text-naranja text-lg">${Math.round((parseFloat(form.valor_uf) || 0) * (ufActual || 38000)).toLocaleString('es-CL')} + IVA</span>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">Nota Adicional (opcional)</label>
            <textarea value={form.nota_adicional} onChange={e => setForm(prev => ({...prev, nota_adicional: e.target.value}))} rows={2} className={cls + ' resize-none'} placeholder="Ej: Incluye viáticos dentro de la Región del Biobío..." />
          </div>
        </div>

        <div className="p-5 border-t dark:border-gray-700 flex gap-3">
          <button onClick={generatePDF} className="flex-1 px-4 py-2.5 color-naranja text-white rounded-lg font-medium hover:opacity-90 transition flex items-center justify-center gap-2">
            📄 Generar PDF
          </button>
          <button onClick={onClose} className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
