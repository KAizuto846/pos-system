// ============ UTILIDADES ============
function filterTable(tableId, searchId) {
  const search = document.getElementById(searchId).value.toLowerCase();
  const rows = document.querySelectorAll(`#${tableId} tbody tr`);

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(search) ? '' : 'none';
  });
}

function openModal() {
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.className = `alert ${type} show`;
  notification.textContent = message;
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.right = '20px';
  notification.style.zIndex = '10000';
  notification.style.minWidth = '300px';

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}
