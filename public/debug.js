/**
 * Script de Debugging para reportes
 * Paste en la console del browser para debuggear problemas
 */

// Test 1: Verificar que los módulos están cargados
function testModulesLoaded() {
  console.log('=== TEST 1: Módulos Cargados ===');
  console.log('✓ Utils disponible:', typeof Utils !== 'undefined');
  console.log('✓ API disponible:', typeof API !== 'undefined');
  console.log('✓ SidebarPedidos disponible:', typeof SidebarPedidos !== 'undefined');
  console.log('✓ state disponible:', typeof state !== 'undefined');
}

// Test 2: Verificar que el endpoint funciona
async function testReportEndpoint() {
  console.log('=== TEST 2: Endpoint de Reporte ===');
  try {
    const response = await fetch('/api/reports/supplier-order?startDate=2025-01-01&endDate=2025-12-31&supplierId=1');
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Datos recibidos:', data);
    console.log('Cantidad de items:', data.length);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Test 3: Verificar sidebar
function testSidebar() {
  console.log('=== TEST 3: Sidebar ===');
  const sidebar = document.getElementById('sidebar-pedidos');
  console.log('✓ Sidebar elemento existe:', !!sidebar);
  console.log('✓ Sidebar visible:', sidebar?.style.display !== 'none');
  console.log('Sidebar elemento:', sidebar);
}

// Test 4: Verificar elemento de reporte
function testReportContainer() {
  console.log('=== TEST 4: Contenedor de Reporte ===');
  const container = document.getElementById('report-content');
  console.log('✓ Contenedor existe:', !!container);
  console.log('✓ Contenedor HTML:', container?.innerHTML?.substring(0, 100));
}

// Test 5: Simular generación de reporte
async function testGenerateReport() {
  console.log('=== TEST 5: Generar Reporte (Simulado) ===');
  
  // Verificar que generateReport existe
  if (typeof generateReport === 'undefined') {
    console.error('❌ generateReport no está definida');
    return;
  }
  
  console.log('✓ generateReport está disponible');
  
  // Ver qué proveedor está seleccionado
  const supplierId = document.getElementById('filterSupplier')?.value;
  console.log('Supplier ID seleccionado:', supplierId);
}

// Ejecutar todos los tests
function runAllTests() {
  console.clear();
  console.log('╔════════════════════════════════════╗');
  console.log('║    TESTS DE DEBUGGING ACTIVOS      ║');
  console.log('╚════════════════════════════════════╝\n');
  
  testModulesLoaded();
  console.log('');
  testReportContainer();
  console.log('');
  testSidebar();
  console.log('');
  testGenerateReport();
  console.log('');
  console.log('Para más tests, ejecuta:');
  console.log('  - testReportEndpoint() → Prueba el endpoint');
  console.log('  - testGenerateReport() → Prueba generar reporte');
}

// Función auxiliar para establecer filtros
function setReportFilters(supplierId, startDate = '2025-01-01', endDate = '2025-12-31') {
  console.log('🔧 Configurando filtros...');
  
  const filterSupplier = document.getElementById('filterSupplier');
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  
  if (filterSupplier) filterSupplier.value = supplierId;
  if (startDateInput) startDateInput.value = startDate;
  if (endDateInput) endDateInput.value = endDate;
  
  console.log('✓ Filtros configurados');
  console.log('  - Proveedor:', supplierId);
  console.log('  - Fecha inicio:', startDate);
  console.log('  - Fecha fin:', endDate);
  console.log('\nAhora ejecuta: generateReport()');
}

// Función para forzar generación de reporte
function forceGenerateReport(supplierId = 1) {
  console.log('⚡ Forzando generación de reporte...');
  
  setReportFilters(supplierId);
  
  // Cambiar a tab de supplier-order
  const tab = document.querySelector('[data-report="supplier-order"]');
  if (tab) {
    tab.click();
    console.log('✓ Tab de supplier-order activado');
  }
  
  // Pequeña pausa y luego generar
  setTimeout(() => {
    generateReport();
  }, 300);
}

// Imprimir instrucciones al cargar
console.log(`
╔════════════════════════════════════════════════════════════╗
║           HERRAMIENTAS DE DEBUGGING DISPONIBLES            ║
╚════════════════════════════════════════════════════════════╝

Ejecuta estos comandos en la consola para debuggear:

  runAllTests()                    → Ejecutar todos los tests
  
  testModulesLoaded()             → Verificar módulos
  testReportContainer()           → Verificar contenedor HTML
  testSidebar()                   → Verificar sidebar
  testReportEndpoint()            → Probar endpoint API
  testGenerateReport()            → Verificar función
  
  setReportFilters(1)             → Configurar filtros
  forceGenerateReport(1)          → Generar reporte (proveedor 1)

Ejemplos:
  forceGenerateReport(1)          → Generar reporte de proveedor 1
  forceGenerateReport(2)          → Generar reporte de proveedor 2
  
Para ver logs en tiempo real mientras se genera:
  Presiona F12 → Console → Ejecuta forceGenerateReport(1)
  Observa los logs que aparecen
`);
