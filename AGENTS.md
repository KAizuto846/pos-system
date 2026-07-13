<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agentes - Guia del Proyecto

## Documentos Importantes
- **`PLAN.md`** - Plan de implementacion completo con todas las fases, archivos a crear/modificar, patrones de codigo, y convenciones. LEER ANTES DE CUALQUIER CAMBIO.

## Resumen del Proyecto
Sistema POS (Punto de Venta) para pequenas empresas. Next.js 16 + React 19 + Prisma + SQLite + Electron. Interfaz en espanol, tema oscuro.

## Estado Actual
- Aplicacion web funcional con auth, productos, ventas, reportes
- Electron configurado para desktop (Windows/Linux)
- NSIS installer configurado pero con archivos .ico/.bmp faltantes
- Auto-updater instalado pero no integrado (script custom que solo abre navegador)
- UDP discovery para encontrar servidores en LAN
- Client/Server mode para multi-dispositivo
- NO hay sync real entre dispositivos (solo health check)
- NO hay soporte offline
- NO hay SSE/WebSocket para tiempo real

## Que Implementar (ver PLAN.md para detalles)
1. **Fase 1:** Server-Sent Events para sync en tiempo real
2. **Fase 2:** Corregir condiciones de carrera en stock/ventas
3. **Fase 3:** Auto-update silencioso con electron-updater
4. **Fase 4:** NSIS installer con wizard de configuracion
5. **Fase 5:** Pagina de setup inicial en la app web
6. **Fase 6:** Offline support (futuro)
7. **Fase 7:** Documentacion Debian + internet access
