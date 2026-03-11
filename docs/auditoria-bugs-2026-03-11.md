# Auditoría técnica de bugs y errores (CRM-THO)

Fecha: 2026-03-11

## Resumen ejecutivo

Se identificaron incidencias de **alta criticidad** que pueden afectar operación, seguridad y estabilidad:

1. **Bug funcional corregido**: el hook de sincronización SII usaba `ufActual` sin recibirlo como parámetro, provocando errores en runtime al sincronizar documentos.
2. **Exposición de credenciales publicables en código**: URL y clave anon de Supabase hardcodeadas.
3. **Logs con datos sensibles en backend**: endpoints API registran trazas detalladas de autenticación/requests.
4. **Bundle principal sobredimensionado**: chunk de ~1.4MB minificado, riesgo de lentitud y time-to-interactive alto.
5. **Desalineación documental**: README apunta a archivo inexistente para configuración Supabase.

## Hallazgos detallados

### A-01 — Hook SII con dependencia implícita de UF (corregido)
- **Severidad**: Alta
- **Impacto**: sincronizaciones de boletas/facturas podían fallar con `ReferenceError` o conversiones UF incorrectas.
- **Causa raíz**: `useSII` usa `ufActual` internamente sin recibirlo explícitamente.
- **Acción aplicada**:
  - `useSII` ahora recibe `ufActual` con fallback seguro (`38000`).
  - Se normaliza a `ufDiaActual` para conversiones monetarias.
  - `App.jsx` ahora inyecta `ufActual` al hook.
- **Estado**: ✅ Corregido.

### A-02 — Credenciales en código cliente
- **Severidad**: Alta
- **Impacto**: rotación difícil, exposición innecesaria en repo/historial, riesgo operacional.
- **Evidencia**: `src/utils/supabase.js` contiene URL y anon key embebidas.
- **Recomendación**:
  - Migrar a `import.meta.env.VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
  - Rotar la anon key publicada si hubo exposición pública.

### A-03 — Logging excesivo en APIs serverless
- **Severidad**: Media-Alta
- **Impacto**: potencial exposición de metadata sensible en logs (credenciales presentes/ausentes, payloads, respuestas de terceros).
- **Evidencia**: `api/sync-boletas.js`, `api/sync-facturas-emitidas.js`, `api/sync-facturas-recibidas.js`.
- **Recomendación**:
  - Reemplazar logs detallados por logs estructurados mínimos con correlation-id.
  - Sanitizar PII y secretos.

### A-04 — Rendimiento frontend (bundle grande)
- **Severidad**: Media
- **Impacto**: carga inicial lenta, peor UX en redes móviles.
- **Evidencia**: build Vite reporta chunk de ~1.4MB.
- **Recomendación**:
  - Code-splitting por rutas/módulos pesados (contabilidad/reportes/pdf).
  - `manualChunks` para librerías grandes (`xlsx`, `jspdf`, `chart.js`).

### A-05 — README inconsistente con estructura real
- **Severidad**: Baja-Media
- **Impacto**: errores de onboarding y configuración.
- **Evidencia**: README menciona `src/supabaseClient.js`, pero el archivo real es `src/utils/supabase.js`.
- **Recomendación**: actualizar documentación y checklist de arranque.

## Plan de remediación recomendado (rápido)

## Fase 1 (24-48h)
- Corregir y desplegar bug SII (ya aplicado).
- Externalizar variables Supabase a entorno y rotar clave.
- Reducir logs sensibles en endpoints.

## Fase 2 (2-4 días)
- Implementar code-splitting del módulo de contabilidad/reportes.
- Agregar validaciones de entrada homogéneas para endpoints SII.
- Actualizar README operativo.

## Fase 3 (1 semana)
- Añadir pruebas mínimas:
  - smoke test de build
  - tests unitarios de parsing/conversión UF
  - test de integración para rutas `/api/sync-*` (mock SimpleAPI)

## Checklist de salida a producción

- [ ] Variables de entorno configuradas en Vercel.
- [ ] Claves rotadas y verificadas.
- [ ] Sin logs sensibles en producción.
- [ ] Build estable y sin errores.
- [ ] Flujo de sincronización SII validado para 1 mes y año completo.

