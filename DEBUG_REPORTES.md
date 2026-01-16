# 🔧 Guía de Debugging - Reportes de Pedidos de Proveedores

## Problema Reportado
- ❌ La tabla del reporte no aparece
- ❌ La barra lateral no se integra correctamente

## Pasos para Debuggear

### Paso 1: Abre la Consola del Browser
```
Presiona: F12
Cliquea: Console
```

### Paso 2: Ejecuta los Tests
Copia y pega esto en la consola:
```javascript
runAllTests()
```

Debería mostrar algo como:
```
=== TEST 1: Módulos Cargados ===
✓ Utils disponible: true
✓ API disponible: true
✓ SidebarPedidos disponible: true
✓ state disponible: true

=== TEST 2: Contenedor de Reporte ===
✓ Contenedor existe: true
✓ Contenedor HTML: <div style=...>

=== TEST 3: Sidebar ===
✓ Sidebar elemento existe: true
```

### Paso 3: Si Algo Falla

**Si Utils no está disponible:**
```javascript
// Verificar que utils.js se cargó
fetch('/public/utils.js')
  .then(r => r.status)
  .then(status => console.log('Status:', status))
```

**Si SidebarPedidos no está:**
```javascript
// Verificar que sidebar-pedidos.js se cargó
console.log(typeof SidebarPedidos);
// Debe mostrar: "object"
```

**Si el contenedor no existe:**
```javascript
// Buscar elemento
document.getElementById('report-content');
// Debe mostrar: <div id="report-content">...</div>
```

### Paso 4: Generar Reporte Manualmente

```javascript
// Para proveedor 1
forceGenerateReport(1)

// Para proveedor 2
forceGenerateReport(2)
```

Observa los logs que aparecen en la consola. Debería ver:
```
📊 Generando reporte de Pedido Proveedor...
Parameters: {startDate: "2025-01-01", endDate: "2025-12-31", supplierId: "1"}
✅ Datos recibidos: [{quantity: 10, product_name: "Tempra", barcode: "BAR-001"}]
📌 Cargando barra lateral para proveedor: 1
✅ Reporte renderizado
```

### Paso 5: Verificar Datos del Endpoint

Si el reporte no muestra datos:

```javascript
// Test el endpoint directamente
testReportEndpoint()
```

Debería mostrar los datos recibidos. Si aparece:
- `[]` (array vacío) → El proveedor no tiene ventas
- `null` → Error en el servidor
- Datos reales → Está funcionando

### Paso 6: Verificar La Tabla

Si aparece "No hay productos..." pero DEBERÍA haber datos:

```javascript
// Chequea qué datos tiene state
console.log('Datos en state:', state.reportData)
console.log('Supplier order:', state.supplierOrder)
```

---

## Soluciones Comunes

### Problema: "No hay productos vendidos para este proveedor"

**Causas:**
1. El proveedor no tiene ventas en el rango de fechas
2. La tabla `product_lines` está vacía (productos sin líneas)
3. El filtro de líneas principales está demasiado estricto

**Solución:**
```javascript
// Verifícalo:
testReportEndpoint()

// Si devuelve [], entonces:
// 1. No hay ventas, O
// 2. No hay product_lines

// Para ver qué tabla está siendo consultada, mira server.js logs
```

### Problema: Sidebar no se abre

**Causas:**
1. `SidebarPedidos` no se cargó
2. El método `loadSupplierOrders` no existe
3. Hay error en la consola

**Solución:**
```javascript
// Abre la consola y ejecuta:
runAllTests()

// Si SidebarPedidos no está disponible, revisa:
// - ¿Se cargó sidebar-pedidos.js?
// - ¿No hay errores al cargar?
```

### Problema: La tabla aparece pero está vacía

**Causas:**
1. Datos vacíos del servidor
2. Función `renderSupplierOrder` retorna HTML vacío

**Solución:**
```javascript
// Después de generar reporte, ejecuta:
console.log('Datos del reporte:', state.reportData)

// Si está vacío:
// 1. No hay sales para ese proveedor/rango
// 2. O el producto no tiene product_lines
```

---

## Flujo Completo (Paso a Paso)

### Lo que DEBERÍA pasar:

1. **Usuario selecciona proveedor y fechas**
   ```
   Proveedor: Franco Ibérica
   Fechas: 01/01 - 31/12
   ```

2. **Usuario cliquea "Generar Reporte"**
   - Se llama `generateReport()`

3. **Backend procesa la solicitud**
   - Endpoint: `/api/reports/supplier-order`
   - Busca sales con esas fechas
   - Filtra por línea principal
   - Devuelve datos en JSON

4. **Frontend recibe datos**
   - `data = await response.json()`
   - Guarda en `state.reportData`
   - Llama `renderSupplierOrder(data)`

5. **Se renderiza la tabla**
   - Si hay datos: muestra tabla
   - Si no hay: muestra mensaje "No hay productos"

6. **Se abre barra lateral**
   - Llama `SidebarPedidos.loadSupplierOrders(supplierId)`
   - Carga pedidos en borrador

---

## Verificación Rápida

Pegá esto en consola y ejecutá:
```javascript
// Test rápido
(async () => {
  console.log('🔍 Iniciando test...\n');
  
  // 1. Módulos
  console.log('✓ Módulos:', {
    Utils: !!window.Utils,
    API: !!window.API,
    SidebarPedidos: !!window.SidebarPedidos
  });
  
  // 2. Elementos
  console.log('✓ Elementos:', {
    reportContent: !!document.getElementById('report-content'),
    sidebar: !!document.getElementById('sidebar-pedidos'),
    filterSupplier: !!document.getElementById('filterSupplier')
  });
  
  // 3. Endpoint
  const res = await fetch('/api/reports/supplier-order?startDate=2025-01-01&endDate=2025-12-31&supplierId=1');
  const data = await res.json();
  console.log('✓ Datos del endpoint:', {
    status: res.status,
    dataLength: data.length,
    firstItem: data[0]
  });
  
  console.log('\n✅ Test completado');
})()
```

---

## Contacto del Servidor

Si sospechas problema en el backend:

1. **Abre servidor logs**
   ```bash
   npm start
   ```

2. **Ejecuta el test que genere reporte**
   ```javascript
   forceGenerateReport(1)
   ```

3. **Observa el log del servidor**
   - Debería ver: `📊 Generando reporte...`
   - O errores SQL

4. **Si ves errores SQL**
   ```
   Error: no such table: product_lines
   ```
   Significa que las migraciones de BD no corrieron. Ejecuta:
   ```bash
   npm start
   # Espera que inicialice la BD
   ```

---

## Checklist de Debugging

- [ ] Consola abierta (F12)
- [ ] `runAllTests()` ejecutado sin errores
- [ ] Todos los módulos disponibles
- [ ] Elemento `report-content` existe
- [ ] Sidebar elemento existe
- [ ] Endpoint devuelve datos (o [] válido)
- [ ] Tabla aparece (o mensaje "No hay datos")
- [ ] Barra lateral se abre (o aparece mensaje en consola)

---

## Información para Reportar

Si aún no funciona, reporta:

1. **Abre consola (F12)**
2. **Ejecuta:**
   ```javascript
   runAllTests()
   ```
3. **Copia TODO el output**
4. **También ejecuta:**
   ```javascript
   forceGenerateReport(1)
   ```
5. **Copia los logs**
6. **Reporta con esta información**

---

## Solución Rápida

Si nada funciona, ejecutá esta limpieza:

```javascript
// Recarga la página completamente
location.reload();

// Espera 2 segundos
// Abre F12 → Console
// Ejecuta:
runAllTests()
```

---

**¿Aún no funciona?** 
Ejecutá `runAllTests()` y compartí el output. Podré ayudarte a identificar el problema exacto.
