# Auditoría CRM-THO — 17 may 2026

Auditoría completa del repo `~/Documents/GitHub/CRM-THO` (Vite + React 18 + Supabase + Tailwind + chart.js + jsPDF + xlsx + @dnd-kit). Total: **~140 hallazgos clasificados**. Lo que sigue es lo que se aplicó hoy mismo, lo que quedó documentado para evaluar, y los pendientes que requieren tu decisión.

Build verificada: `npm run build` corre OK sin warnings nuevos. La corrupción de iCloud sobre `node_modules` del repo principal sigue presente — se levantó una copia limpia en `/tmp` para validar el build (es un problema de infraestructura, no del código; el fix definitivo es mover el repo fuera de `~/Documents`).

---

## 1. Bugs críticos arreglados (rompían cosas en runtime)

| # | Bug | Archivo | Fix |
|---|---|---|---|
| B1 | `XLSX` no importado — Importar Cartola tiraba `ReferenceError` | `src/hooks/useFinanzas.jsx` | Agregado `import * as XLSX from 'xlsx'` |
| B2 | `useFinanzas` referenciaba `ufActual` y `loadFacturas*/loadBoletas/loadSueldos` que no recibía como props → ReferenceError al aplicar conciliación | `src/hooks/useFinanzas.jsx` + `src/App.jsx` | Firma del hook actualizada; props pasadas desde App. `ufActual` con fallback a 38000. |
| B4 | `filtroSueldosDesde/Hasta` no declarados → crash al exportar sueldos | `src/components/Contabilidad/ContabilidadView.jsx` | Reemplazado por `dateRange` global o etiqueta genérica. |
| B29 | `moneda_principal` se enviaba al insert de `facturas_recibidas` pero la columna no existe (schema drift) | `src/components/Contabilidad/ContaModal.jsx` + `ContabilidadView.jsx` | Removido del default; filtro defensivo en handleSave. |
| B25 | `MetricCard` usaba clases Tailwind dinámicas `border-${color}` que no se compilan → colores rotos para `red` | `src/components/shared/MetricCard.jsx` | Mapa estático de clases por color (verde/naranja/azul/red/yellow/blue/gray). |
| B8 | Tickets sin fecha de inicio válida producían `NaN` que envenenaba todo el chart de ingresos | `src/components/Reportes/ReportesView.jsx` | Skip de tickets con fecha inválida, guards `isFinite`. |
| B51 | División por cero en `buscarMatches` cuando un monto era 0 → score falso | `src/hooks/useFinanzas.jsx` | Guard explícito si alguno de los montos es 0/no finito. |
| B52 | `aplicarConciliacion` podía aplicarse 2 veces (race condition) sobreescribiendo silencio | `src/hooks/useFinanzas.jsx` | WHERE adicional `estado_conciliacion = 'pendiente'`. Toast de "ya estaba conciliado" si no hace nada. |
| B34 | `email.split('@')` reventaba si OAuth no devolvía email | `src/App.jsx` | Guard `email \|\| ''` antes del split. |
| B71 | `tipo.startsWith` en proposalPDF reventaba con `tipo=undefined` | `src/utils/proposalPDF.js` | Cast a `String(tipo \|\| '')`. |

## 2. Incoherencias funcionales corregidas (cosas que existían en la UI pero no servían)

- **U6 — Pipeline ignoraba sus propios filtros**: la barra de búsqueda y el dropdown de tipo en la pestaña Pipeline existían pero no filtraban nada. Ahora `filteredProspectos` se memoriza y se pasa al kanban. Añadí indicador "X de Y prospectos" y botón "Limpiar filtros" cuando hay algún filtro activo.
- **U5 — Exportar Pipeline ignoraba filtros**: el botón 📥 exportaba `prospectos` completo. Ahora exporta `filteredProspectos`. Mismo fix en KeyAccounts (`filteredKeyAccounts`).
- **B11 — Reportes ignoraba `dateRange`**: los gráficos mostraban "Últimos 6 meses" aunque el usuario hubiera seleccionado otro rango. Ahora `rangoMeses` respeta `dateRange` con cap a 24 meses, y el subtítulo dice "X meses (filtrado)" cuando hay rango activo.
- **B53 — Probabilidad por estado incompleta**: faltaban `Lead nuevo` (5%) y `Contactado` (15%) en `handleMoveProspecto`. Ahora se usa un map completo y los pipelines ponderados quedan correctos.
- **U2 — KeyAccounts subtitle UF hardcoded 38000**: ahora usa `ufActual` real.
- **U33 — CSV de EERR sin BOM**: Excel rompía los acentos. Agregado `﻿` al blob.

## 3. UX y manejo de errores

- **B10 — Gráficos de Reportes no se refrescaban con UF**: la dep array no incluía `ufActual`. Ahora las gráficas se rebuildean cuando se resuelve la UF del día.
- **B13 — Errores silenciosos en loaders**: todos los `loadX` de useData ahora destructuran `error` y muestran toast (no para errores triviales tipo PGRST116). Ya no más "sin datos" cuando en realidad falló la query por RLS.
- **B50 — Conciliación: toast engañoso**: si el update del movimiento bancario funcionaba pero el de la factura no, el toast decía "✅ Aplicada" igual. Ahora distingue y avisa "Movimiento conciliado, pero no se pudo actualizar X".
- **U10 — Confirmaciones destructivas con Enter**: el modal de confirmar tenía `autoFocus` en Confirmar y aceptaba Enter incluso para `danger: true`. Ahora en danger el autofocus va a Cancelar y Enter no confirma; solo click. Evita borrados accidentales.
- **U24 — "Limpiar Todo" de conciliación**: borra todos los movimientos bancarios. Ahora pide tipear `ELIMINAR` después del confirm.
- **B14 — submitConvert sin validación**: ahora valida fechas y UF/mes antes de mandar el insert; mensaje específico al usuario.
- **B6 — `confirm()` nativo en EntityDetail**: reemplazado por `confirmModal` (estilizado, consistente con el resto).
- **B68 — Email normalizado en login**: ahora lowercase + trim antes de guardar y comparar.
- **U28 — Botón "Continuar como invitado" confuso**: relabelado a "Cerrar" con tooltip que explica el modo solo-lectura.
- **U30 — Toggle UF/CLP no persistía**: ahora se guarda en localStorage como darkMode.

## 4. Modales — ESC y loading states

Creado hook `src/hooks/useEscapeKey.js` reutilizable. Conectado en:
- `UniversalModal` — ESC + disabled mientras guarda + loading state
- `EntityDetail` — ESC + error con detalle (antes solo decía "Error al guardar")
- `HistoryModal` — ESC + key estable por item.id
- `FilesModal` — ESC + key estable por file.id/name
- `ContaModal` — ESC + disabled mientras guarda
- Modales inline de App.jsx (Convertir / Renovar) — ESC + click-outside

## 5. Performance / quickwins de bundle

- **B24 — useMetrics no estaba memoizado**: cada cambio de tab o searchTerm recalculaba filtros sobre arrays enteros. Ahora todo el cuerpo está envuelto en `useMemo([prospectos, cerrados, tickets, keyAccounts, ufActual])`. Mejora notable en repos con cientos de prospectos.
- **B23 + map de estados kanban como constante fuera del hook**: ya no se recrea el array `estadosKanban` ni los maps en cada render. `prospectosPorEstado` ahora puede recibir una lista override (la usamos para los filtros del pipeline).
- **B9 — `prepararDatosIngresos/Pipeline/Conversion` se ejecutaban en cada render**: convertidos a `useMemo` con sus deps correctas.
- **B12 — Auto-expire de KAs hacía N updates en loop**: ahora un único `update(...).in('id', ids)` y patch local del state.
- **B59 — useData re-cargaba al cambiar referencia del objeto user**: dep cambiada a `user?.email` (string).
- **B95 — submitConvert recargaba 4 endpoints serialmente**: ahora `Promise.all`.
- **P5 — `EntityDetail` ahora es lazy**: arrastraba jsPDF (~350KB) al bundle inicial. Cargado vía `lazy()` + Suspense; el chunk de jsPDF no entra hasta que se hace click en "Propuesta". Ya se ve en el build separado en `proposalPDF-*.js` (398KB) — antes vivía en `index-*.js`.
- **B58 — UF se cacheaba para siempre**: ahora se refresca cada 6h por si la pestaña queda abierta días.
- **B44/B45 — formatters defensivos**: `formatCLP/formatNumber/formatUF/formatFileSize` ahora rechazan NaN explícitamente (antes devolvían "$0" silenciando bugs upstream). `formatDate/formatDateTime` validan `Invalid Date`.
- **B81 — filterByDateRange comparaba strings ISO + timestamps mezclados**: ahora normaliza a `YYYY-MM-DD` antes de comparar.
- **B87 — CSV export perdía columnas si el item 0 no las tenía**: ahora hace union de keys de todos los items.
- **U42 — KeyAccounts ordering numérico**: `localeCompare('es-CL', { numeric: true })` — "Acme 2" ya viene antes que "Acme 10".

## 6. Limpieza de código

- B3 — `obtenerUFHoy` duplicado en App.jsx eliminado; queda solo el de `utils/formatters.js`.
- B33 — Cmd+K listener ya no se reinstala en cada cambio de `showGlobalSearch` (usa updater functions).
- B36/B37/B38/B47/B57/U13 — Keys de listas (Dashboard actionItems, actividadReciente, HistoryModal, FilesModal, global search results) ahora usan `item.id` o llaves estables, no `index`.
- B65 — `uniqueClients` en Dashboard ahora hace `trim()` antes de `toLowerCase()`.
- B70/U23 — `proposalPDF` formatea UF con locale `es-CL` y sanitiza el filename contra caracteres especiales.
- B74/B75/B76 — Imports muertos eliminados de `App.jsx` y `ContabilidadView.jsx` (`useRef`, `showToast`, formatters no usados).
- B86 — `EntityDetail.handleSave` ahora también excluye `updated_at, created_by_email` del update.
- B22 — Dark mode aplicado al header del pipeline (antes era `bg-white` sin variante dark).
- Safe localStorage wrapper (`safeStorage`) para evitar `QuotaExceededError` en Safari modo privado.
- Click-outside añadido a los modales inline (Convertir, Renovar).

---

## Pendientes que NO toqué (requieren tu decisión)

### Seguridad — alta prioridad
- **B18 + B19 — RLS y validación cliente-only**: el login modal solo valida emails contra una lista hardcoded en cliente. La auth real depende de RLS de Supabase. En `sql/bloque2-migration.sql:27,48` las policies de `contactos` y `notas` están en `USING (true) WITH CHECK (true)` → cualquiera con el anon public key (que está hardcoded en `src/utils/supabase.js:4`) puede leer/escribir contactos y notas. **Recomiendo cambiar las policies a `USING (auth.uid() IS NOT NULL)` y forzar login real con Supabase Auth antes de cualquier difusión amplia del CRM.**
- **B20 — Endpoint `/api/public/leads.js` acepta API key en body**: si un cliente manda la key en el body JSON, queda en logs de Vercel. Recomiendo quitar `req.body.apiKey` y dejar solo el header Authorization. (Cambio trivial pero es decisión tuya cuándo desplegarlo, ya que `tho-web` puede estar usando body.)
- **B21 — Anon key hardcoded en `src/utils/supabase.js`**: debería moverse a `import.meta.env.VITE_SUPABASE_*`. Sin RLS sólidas, esa key da acceso al schema. No la toqué porque cambiarla implica también configurar la env var en Vercel.

### Refactors que escapan al "fix en una pasada"
- **B5 — handleCloseTicket usa 4 prompts/confirms nativos seguidos**: requiere modal dedicado. Lo dejé apuntado.
- **B28 — Schema drift "Reclamado" vs "Reclamada"**: hay valores mixtos en DB. Necesita migración SQL para normalizar todo a `Reclamada` antes de eliminar la rama defensiva del código.
- **D1/D2/D4 — Código muerto**: `ProposalGenerator.jsx`, `THOLogo.jsx` y `components/contabilidad.js` (root) no se importan en ningún lado. Los dejé tal cual por si los tenías reservados para algo. Si confirmas, los borro.

### Notas finales

- El bundle principal sigue pesando ~880KB (xlsx eager-loaded contribuye fuerte). Próximo quickwin grande sería lazy-loadear xlsx dentro de los handlers de importación; lo dejé pendiente por riesgo de tocar `excelParsers.js` en una pasada sin tests.
- ProspectoCard "Mover a..." todavía es un dropdown chico — no ideal en mobile (U26). Idea: bottom-sheet en pantallas pequeñas.
- Tabs (`<nav>` + `<button>` sin `role="tablist"`/`aria-selected`) — pendiente accesibilidad básica.

---

## Cómo validar los fixes

```bash
cd ~/Documents/GitHub/CRM-THO
npm run build   # OK — verificado hoy
npm run dev     # smoke test manual
```

Sugerencias de prueba manual:

1. **Conciliación**: importar cartola Excel (antes reventaba con `XLSX is not defined`). Aplicar match a una factura → la factura debe pasar a Cobrada/Pagada. Intentar aplicar el mismo match dos veces → segunda vez debe avisar "ya estaba conciliado".
2. **Pipeline**: escribir algo en el input "Buscar..." y seleccionar Tipo. Verás "Mostrando X de Y prospectos" y el kanban filtrado. Click "Limpiar filtros" resetea. Exportar pipeline ahora respeta el filtro.
3. **Reportes**: cambiar `DateRangeFilter` y mirar el gráfico de ingresos — debería expandirse/contraerse a esos meses (antes siempre eran 6).
4. **Modales con ESC**: abrir cualquier modal y apretar ESC → cierra. Click fuera del modal de Convertir/Renovar → cierra.
5. **ContaModal en facturas recibidas**: crear o editar — antes reventaba con "column moneda_principal does not exist".
