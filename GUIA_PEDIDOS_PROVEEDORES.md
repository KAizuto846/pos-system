# 📚 Guía de Uso - Sistema de Pedidos de Proveedores

## ¿Qué Cambió?

El sistema de pedidos de proveedores ahora funciona de forma **mucho más profesional** y flexible:

### Antes ❌
- Un pedido = un solo producto
- No podías marcar qué parte llegó
- No se guardaban notas
- Difícil de reasignar a otro proveedor

### Ahora ✅
- Un pedido = múltiples productos
- Marcas qué cantidad llegó de cada uno
- Agregas notas por item ("Falta inspección", "En camino", etc.)
- Todo se guarda automáticamente
- Preparado para arrastrar items entre pedidos

---

## Cómo Usar

### Paso 1: Generar Reporte de Pedido Proveedor

1. Ve a **Reportes** en el sidebar
2. Selecciona **Pedido Proveedor**
3. Elige:
   - 📅 Fechas (desde - hasta)
   - 🏢 Proveedor (línea principal)
   - Click **Generar Reporte**

### Paso 2: Aparece la Barra Lateral

En el lado derecho verás una barra gris con:
- **Pedidos Pendientes** en el título
- Botón ✕ para cerrar
- Lista de pedidos existentes
- Botones "Nuevo Pedido" y "Guardar Cambios"

```
┌─────────────────┐
│ 📦 Pedidos      │
│  Pendientes    │
│        ✕       │
├─────────────────┤
│ Pedido #1       │
│ ✅✅❌         │
│                 │
│ Pedido #2       │
│ ✅✅✅         │
│                 │
├─────────────────┤
│ ➕ Nuevo       │
│ 💾 Guardar     │
└─────────────────┘
```

### Paso 3: Crear Nuevo Pedido

Opción A: **Desde la tabla de reportes**
- Arriba de la tabla hay botón "➕ Agregar Producto"
- Editas como Excel
- Cliqueas "💾 Guardar Pedido"

Opción B: **Desde la barra lateral**
- Click "➕ Nuevo Pedido"
- Sistem crea pedido vacío
- Click en el pedido para agregar items

### Paso 4: Editar Items del Pedido

Cuando cliqueas en un pedido en la barra, se abre con detalles:

```
┌─────────────────────────────────┐
│ Pedido #5                       │
│ ➕ Agregar | ⬅️ Volver          │
├─────────────────────────────────┤
│ Tempra                  BAR-001│
│                                 │
│ Cantidad solicitada:            │
│ [50                          ]  │
│                                 │
│ Cantidad recibida:              │
│ [50                          ]  │
│                                 │
│ ☑ Marcar como recibido          │
│                                 │
│ Notas:                          │
│ [Llegó en buen estado       ]   │
│                                 │
│ 🗑️ Eliminar Producto           │
├─────────────────────────────────┤
│ Amoxicilina                ... │
│ ...                             │
└─────────────────────────────────┘
```

### Paso 5: Marcar Como Recibido

Para cada item puedes:

1. **Editar cantidad recibida:**
   - Si pediste 100 y llegaron 85
   - Editas el campo a 85
   - Se guarda automáticamente

2. **Marcar recibido:**
   - Click checkbox "Marcar como recibido"
   - El item se marca ✅
   - La barra lateral muestra progress

3. **Agregar notas:**
   - "Llegó con 5 unidades rotas"
   - "Falta 15 unidades por llegar"
   - "Requiere inspección"
   - Se guarda al cambiar campo

### Paso 6: Guardar Cambios

Cuando terminaste de marcar todo:
- Click **"💾 Guardar Cambios"** (abajo de barra)
- El estado del pedido cambia a "✉️ Enviado"
- Se guarda en la BD

---

## Casos de Uso

### Caso 1: Pedido Llega Completo

```
1. Generas reporte (Pedido Proveedor)
2. Barra lateral muestra pedidos pendientes
3. Cliqueas un pedido
4. Verificas cantidades (están bien)
5. Marcar ☑ "Marcar como recibido"
6. Click "💾 Guardar Cambios"
7. Pedido pasa a estado "✅ Recibido"
```

### Caso 2: Pedido Llega Parcial

```
1. Abres pedido en barra lateral
2. Item 1: "Tempra" = pediste 100, llegaron 85
   → Editas "Cantidad recibida" a 85
   → Agregas nota "Falta 15 en tránsito"
   → NO marques ☑ (aún está pendiente)
3. Item 2: "Amoxicilina" = completo
   → Marcar ☑ y guardar
4. Barra muestra: "2 de 5 items recibidos"
5. Click "💾 Guardar Cambios"
6. Estado = "📦 Parcialmente Recibido"
```

### Caso 3: Necesitas Agregar Item al Pedido

```
1. Abres barra lateral
2. Cliqueas en el pedido
3. Click "➕ Agregar Producto"
4. Ingresa ID del producto (ej: 5)
5. Ingresa cantidad (ej: 50)
6. Se agrega a la lista
7. Puedes marcar como recibido o dejar pendiente
```

### Caso 4: Producto Llegó Dañado - Eliminar

```
1. Abres barra lateral
2. Cliqueas en el pedido
3. En el item dañado, click "🗑️ Eliminar Producto"
4. Se elimina del pedido
5. Agregar new item si necesitas
```

---

## Próximas Features (Trabajando)

### Próxima Semana: Drag-Drop 🚀
Podrás:
- Arrastrar un item no recibido a otro pedido
- Mover item a otro proveedor
- Reasignar automáticamente

### Próxima Quincena: Líneas Múltiples
- Ver qué líneas pertenece cada producto
- Cambiar línea principal
- Reportes por línea

---

## Tips y Trucos

### ⚡ Atajo Rápido
Si generaste el reporte en Excel:
1. Copia cantidades de Excel
2. Pega en "Cantidad recibida" de la barra
3. Guarda

### 📱 Responsive
- La barra funciona en mobile también
- Swipe derecha para abrir
- Swipe izquierda para cerrar

### 🔍 Buscar Pedidos
- Barra lateral lista todos los pedidos
- Click en uno para ver detalles
- Volver para cambiar entre pedidos

### 💾 Auto-Save
- Cada campo que edites se guarda automáticamente
- No necesitas click extra
- Pero click "Guardar Cambios" cambia estado oficial del pedido

---

## Troubleshooting

### P: No aparece barra lateral
**R:** 
1. Generaste reporte de "Pedido Proveedor"?
2. Seleccionaste un proveedor?
3. Abre browser console (F12) y busca errores

### P: No me deja agregar producto
**R:**
- Necesitas el ID del producto (número)
- Usa el código del producto o búscalo en inventario
- Cantidad debe ser > 0

### P: ¿Se pierden los datos al cerrar?
**R:** NO, todo se guarda en la BD. Si cierras la barra:
1. La información queda guardada
2. Reabre barra → cargan los mismos pedidos
3. Puedes continuar edith donde dejaste

### P: ¿Puedo eliminar un pedido?
**R:** Solo si está en estado **"📝 Borrador"**
- En la barra, click "🗑️ Eliminar"
- Si está en otros estados, antes cambia status a borrador

---

## Estados del Pedido

| Estado | Significa | Puedes Editar? |
|--------|-----------|---|
| 📝 Borrador | Aún lo estás haciendo | ✅ Sí |
| ✉️ Enviado | Ya se lo mandaste al proveedor | ⏳ Parcial |
| ⏳ Pendiente | Esperas que llegue | ⏳ Parcial |
| 📦 Parcialmente Recibido | Llegó parte | ✅ Sí |
| ✅ Recibido | Llegó todo | ❌ No |

---

## Acciones Posibles por Estado

### Borrador (Draft)
- ✅ Agregar items
- ✅ Editar items
- ✅ Eliminar items
- ✅ Eliminar pedido entero
- ✅ Cambiar a "Enviado"

### Enviado (Sent)
- ✅ Ver items
- ✅ Marcar como recibido
- ✅ Editar notas
- ❌ Eliminar items
- ✅ Cambiar a "Pendiente"

### Parcialmente Recibido
- ✅ Ver qué llegó
- ✅ Agregar más items
- ✅ Editar notas
- ✅ Marcar como "Recibido" cuando llegue el rest

---

## Integración con Inventario

Cuando marques un item como **"✅ Recibido"**:
- En próxima versión se actualizará **automáticamente** el stock
- Ahora debe ser manual (más seguro)

Para actualizar stock:
1. Puedes usar "Alta Rápida"
2. O editar producto en inventario

---

## Notas Importantes ⚠️

### Devoluciones NO Crean Pedidos
Si devuelves un producto:
- ❌ NO se agrega automáticamente a pedidos
- ✅ Solo se incrementa el stock
- ✅ Se registra como venta negativa

Si quieres reabastecer después de devolución:
1. Crea nuevo pedido manualmente
2. O edita uno existente

### Líneas Principales
Cuando generas reporte de proveedor:
- **Solo ve productos donde ESE es la línea principal**
- Si un producto pertenece a múltiples proveedores, solo aparece en su línea principal
- Esto es intencional (evita duplicados)

---

## Preguntas Frecuentes

**P: ¿Dónde veo el historial de pedidos?**
R: En "Reportes" → "Historial de Ventas" puedes ver qué se vendió. Los pedidos en sí se ven en la barra lateral.

**P: ¿Puedo hacer pedido a varios proveedores a la vez?**
R: No desde esta pantalla. Cada pedido es para UN proveedor. Pero puedes tener múltiples pedidos abiertos.

**P: ¿Qué pasa si un item tiene múltiples líneas?**
R: Solo aparece en su línea PRINCIPAL. Las secundarias se usan para reasignación (próxima feature).

**P: ¿Se puede exportar el pedido a PDF?**
R: Próxima versión. Ahora copias/pega de la tabla.

**P: ¿Hay auditoría de quién cambió qué?**
R: No está implementado. Se guarda cuándo cambió pero no quién. Se puede agregar si necesitas.

---

## Próximos Pasos

1. **Drag-Drop** entre pedidos
2. **Auto-update de stock** cuando recibas
3. **Exportar a PDF**
4. **Notificaciones de reabastecimiento**
5. **Historial completo de cambios**

---

¿Preguntas? Revisa [IMPLEMENTACION_PEDIDOS.md](IMPLEMENTACION_PEDIDOS.md) para detalles técnicos.

