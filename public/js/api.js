// ============ API FETCH CENTRALIZADO ============
// Wrapper para todas las llamadas al servidor

async function apiFetch(endpoint, options = {}) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  // No sobrescribir Content-Type para FormData (e.g. importación Excel)
  if (options.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  const response = await fetch(endpoint, config);
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || `Error HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return { response, data };
}

// Atajos para métodos comunes
async function apiGet(endpoint) {
  const { data } = await apiFetch(endpoint);
  return data;
}

async function apiPost(endpoint, body) {
  const { data } = await apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return data;
}
