// Setup centralizado de Chart.js.
//
// Antes Chart.register(...registerables) se llamaba en App.jsx, lo que forzaba
// a chart.js (~200KB) a entrar en el bundle inicial aunque el usuario nunca
// abriera un gráfico.
//
// Ahora este módulo hace el register una sola vez (el módulo se cachea) y lo
// importan SÓLO los componentes que usan gráficos (ReportesView, ContabilidadView).
// Como esos componentes son lazy-loaded, chart.js se descarga recién cuando el
// usuario entra a esas pestañas.

import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

export { Chart };
