# 📋 Sistema de Líneas de Productos

## ¿Qué es una Línea?

Una **línea** es el proveedor principal de un producto.

**Ejemplo Real:**
```
Producto: Tempra (Paracetamol 500mg)

Línea 1 (Principal): Franco Ibérica
  → Al hacer reporte "Pedido Proveedor", Tempra aparece aquí
  → Se vende constantemente de este proveedor

Línea 2 (Secundaria): Empsur
  → No aparece en reportes de Empsur
  → Pero si Franco no tiene stock, puedes reasignar aquí (próxima feature)

Línea 3 (Secundaria): Efe
  → Opcional, para casos especiales
```

---

## Por Qué es Importante

### Sin Sistema de Líneas
```
Problema: ¿De cuál proveedor debería pedir?
- Tempra tiene 3 proveedores posibles
- Al hacer reporte, ¿a cuál le vendo?
- Sin orden clara = confusión
```

### Con Sistema de Líneas
```
Solución: Tempra tiene UNA línea principal
- Reportes siempre muestran la misma línea
- Admin sabe exactamente a quién comprar
- Secundarias = backup o casos especiales
```

---

## Cómo Funciona

### En Reportes

Cuando haces **Reportes → Pedido Proveedor**:

```javascript
// Generador busca:
SELECT productos 
WHERE producto.linea_principal = proveedor_seleccionado

// EJEMPLO:
// Seleccionaste: Franco Ibérica (proveedor)
// Mostrará:
// - Tempra (linea principal = Franco Ibérica) ✅
// - Amoxicilina (linea principal = Franco Ibérica) ✅
// - Ibupirofeno (linea principal = Empsur) ❌ NO aparece
```

### En Inventario

Cada producto muestra sus líneas:
```
┌─────────────────────────────┐
│ Tempra                      │
│ Stock: 150                  │
│ Precio: $2.50              │
│                             │
│ Líneas:                    │
│ [Principal] Franco Ibérica │
│ [Secundaria] Empsur        │
│ [Secundaria] Efe           │
│                             │
│ Cambiar principal ▼         │
└─────────────────────────────┘
```

---

## Gestión de Líneas

### Agregar Nueva Línea a Producto

Hay dos formas:

**Opción 1: Desde Inventario**
```
1. Abre producto "Tempra"
2. Sección "Líneas"
3. Click "➕ Agregar Línea"
4. Selecciona "Empsur"
5. Guarda
```

**Opción 2: Desde Productos Bulk**
```
1. Ve a "Productos"
2. Busca "Tempra"
3. Click "Editar"
4. Sección "Proveedores"
5. Agrega "Empsur"
```

### Cambiar Línea Principal

```
1. Abre producto
2. En lista de líneas, click radio button al lado de "Empsur"
3. Ahora Empsur es la línea principal
4. Guarda cambios
```

**Resultado:**
- Próximos reportes de Empsur mostrarán este producto
- Reportes de Franco Ibérica NO lo mostrarán (a menos que lo cambies de vuelta)

### Eliminar Línea Secundaria

```
1. Abre producto
2. En línea secundaria (Ej: Efe)
3. Click "🗑️ Eliminar"
4. Producto ya no está en línea Efe
5. Guarda
```

⚠️ **Nota:** No puedes eliminar la línea principal sin tener otra.

---

## Casos de Uso

### Caso 1: Producto Tuve de Múltiples Proveedores

**Escenario:** Tempra tiene 3 proveedores posibles

```
ANTES:
- Confusión: ¿A cuál proveedor le pido?
- Reportes sin orden

AHORA:
1. Tempra → Línea Principal: Franco Ibérica
2. Agregas línea secundaria: Empsur
3. Agregas línea secundaria: Efe
4. Reportes siempre piden a Franco
5. Si Franco no tiene stock:
   - Tú manualmente cambias línea principal a Empsur
   - O draggeas el item al pedido de Empsur (próxima feature)
```

### Caso 2: Cambiar Proveedor de un Producto

**Escenario:** Franco ha aumentado precios, decides cambiar a Empsur

```
ANTES:
Franco Ibérica → Tempra (línea principal)
Empsur → (no existe)

CAMBIO:
1. Abre Tempra
2. Agregas línea "Empsur"
3. Cambias "Empsur" como línea principal
4. Eliminas línea "Franco Ibérica" (opcional)

DESPUÉS:
Empsur → Tempra (línea principal)

RESULTADO:
- Próximos reportes piden a Empsur automáticamente
- Sin editar nada más
```

### Caso 3: Reasignar un Pedido

**Escenario:** Franco no tiene stock, pero Empsur sí

```
PROCESO (cuando se implemente drag-drop):
1. Abres reporte de Franco Ibérica
2. En barra lateral, ves Tempra en el pedido
3. Arrastra Tempra → Pedido de Empsur
4. Sistema sabe que Empsur también vende Tempra (línea secundaria)
5. Item se mueve automáticamente
```

**Por ahora (manual):**
1. Abre barra lateral → Pedido de Franco
2. Toma nota de qué falta
3. Crea o abre pedido de Empsur
4. Agrega el producto manualmente

---

## Reportes Filtrados por Línea Principal

### Query SQL Actual

```sql
SELECT productos 
FROM sales_items
JOIN products
JOIN product_lines
WHERE product_lines.supplier_id = ? 
  AND product_lines.is_primary = 1
```

### Qué Significa

**SOLO** muestra productos donde:
- El proveedor seleccionado es su línea principal
- Productos con ese proveedor en líneas secundarias NO aparecen

### Ejemplo

```
PRODUCTO: Amoxicilina

LÍNEAS:
┌──────────────────────┐
│ Franco Ibérica       │ ← PRINCIPAL
│ Empsur (secundaria)  │
│ Efe (secundaria)     │
└──────────────────────┘

REPORTE DE FRANCO:
→ Amoxicilina aparece ✅

REPORTE DE EMPSUR:
→ Amoxicilina NO aparece ❌
(Aunque Empsur la tiene)

REPORTE DE EFE:
→ Amoxicilina NO aparece ❌
```

---

## Ventajas de Este Sistema

| Ventaja | Antes | Ahora |
|---------|-------|-------|
| **Claridad** | ¿A quién pido? | Siempre la línea principal |
| **Consistencia** | Reportes diferentes cada día | Reportes estables |
| **Flexibilidad** | Un solo proveedor | Múltiples opciones |
| **Control** | Manual y confuso | Automático y ordenado |
| **Escalabilidad** | Difícil cambiar | Cambio en 1 click |

---

## API Para Gestionar Líneas

### Endpoints

```javascript
// Obtener líneas de un producto
GET /api/products/:productId/lines

// Agregar línea
POST /api/products/:productId/lines
{
  "supplierId": 1,
  "isPrimary": false
}

// Cambiar a principal
PATCH /api/products/:productId/lines/:lineId
{
  "isPrimary": true
}

// Eliminar línea
DELETE /api/products/:productId/lines/:lineId
```

### Ejemplo en Frontend

```javascript
// Agregar línea secundaria
await fetch(`/api/products/5/lines`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    supplierId: 2,  // Empsur
    isPrimary: false
  })
});

// Cambiar a principal
await fetch(`/api/products/5/lines/3`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    isPrimary: true
  })
});
```

---

## Próxima Fase: Drag-Drop y Reasignación

Cuando implementemos drag-drop:

```
1. Abres reporte de Franco Ibérica
2. Barra lateral muestra Tempra en pedido
3. Tempra tiene líneas secundarias: Empsur, Efe
4. Arrastra Tempra a un pedido de Empsur
5. Sistema automáticamente:
   - Verifica que Empsur vende Tempra ✅
   - Mueve item al pedido de Empsur
   - Actualiza líneas principales si necesita
```

---

## Reglas y Restricciones

### Regla 1: Cada Producto Tiene MÍNIMO una Línea Principal
```
✅ Válido: 
- Franco Ibérica (principal)
- Empsur (secundaria)

❌ Inválido:
- (vacío)

❌ Inválido:
- Empsur (solo secundaria, sin principal)
```

### Regla 2: Línea Principal Debe Existir
```
✅ Válido:
- Franco Ibérica (principal)

❌ Inválido:
- Franco Ibérica (principal) → ¡Franco fue eliminado!

Solución: Cambiar a otra línea antes de eliminar proveedor
```

### Regla 3: No Hay Duplicados
```
❌ No puedes agregar la misma línea dos veces:
- Franco (principal)
- Franco (secundaria) ❌

✅ Válido:
- Franco (principal)
- Empsur (secundaria)
```

---

## Troubleshooting

### P: No me deja eliminar una línea
**R:** Esa es la única línea del producto. Agrega otra primero, luego elimina esta.

### P: No aparece un producto en el reporte
**R:** Verifica que su línea principal es el proveedor que seleccionaste.
```javascript
// Desde browser console:
// Ver líneas de producto ID 5
fetch('/api/products/5/lines')
  .then(r => r.json())
  .then(data => console.log(data))
```

### P: ¿Puedo cambiar línea principal?
**R:** Sí, pero afecta a reportes futuros:
- Reportes del proveedor anterior NO lo mostrarán
- Reportes del nuevo proveedor SÍ lo mostrarán

---

## Integración con Inventario Actual

El sistema de líneas convive con:

```
Tabla products:
├─ supplier_id (legacy, no se usa)
├─ primary_line_id (línea principal actual)
└─ ...

Tabla product_lines (NUEVA):
├─ product_id
├─ supplier_id
├─ is_primary (1 = principal, 0 = secundaria)
└─ created_at
```

**Migración:**
- Los productos existentes tienen `supplier_id` viejo
- Gradualmente se migran a `product_lines`
- Sistema soporta ambos (backwards compatible)

---

## Próximas Mejoras

- [ ] UI mejorada para gestionar líneas
- [ ] Validación de cambios de línea principal
- [ ] Historial de cambios de línea
- [ ] Alertas cuando cambias línea
- [ ] Reporte de productos multi-línea
- [ ] Auto-reasignación inteligente basada en histórico

---

## Sumario

**Con el sistema de líneas:**
- ✅ Cada producto tiene un proveedor principal claro
- ✅ Puedes agregar múltiples proveedores como backup
- ✅ Reportes son consistentes y automatizados
- ✅ Fácil cambiar de proveedor sin romper nada
- ✅ Preparado para drag-drop y reasignación

**Sin el sistema:**
- ❌ Confusión sobre a quién pedirle
- ❌ Reportes inconsistentes
- ❌ Difícil cambiar de proveedor
- ❌ No hay forma de manejar múltiples fuentes

