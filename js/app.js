// public/js/app.js
const API_BASE = (window.API_BASE_OVERRIDE) ? window.API_BASE_OVERRIDE : (window.location.origin + '/api');

// Prosty helper fetch z obsługą błędów
async function apiFetch(path, opts = {}) {
  const url = (path.startsWith('http')) ? path : `${API_BASE}${path}`;
  try {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const ct = res.headers.get('content-type') || '';
      const text = ct.includes('application/json') ? await res.json() : await res.text();
      throw new Error(JSON.stringify({ status: res.status, body: text }));
    }
    return res;
  } catch (err) {
    console.error('apiFetch error', err);
    throw err;
  }
}

// Przykład: pobierz kategorie i wyrenderuj (użyj w index/dashboard)
export async function loadCategoriesInto(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  try {
    const resp = await apiFetch('/kategorie');
    const cats = await resp.json();
    container.innerHTML = cats.map(c => `
      <div class="collection-card">
        <div class="collection-thumbnail"><img src="images/${(c.nazwa||'').replaceAll(' ','_')}.png" onerror="this.src='images/default.png'"></div>
        <div class="card-content">
          <h3 class="card-title">${escapeHtml(c.nazwa)}</h3>
          <p class="card-subtitle">${escapeHtml(c.opis||'')}</p>
          <a href="start.html?id=${c.id_kategorii}" class="cta-button primary">Rozpocznij</a>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p>Błąd pobierania kategorii</p>';
  }
}

export async function requestReportUsers({rola, email}) {
  const params = new URLSearchParams();
  if (rola) params.set('rola', rola);
  if (email) params.set('email', email);
  const url = `/reports/users?${params.toString()}`;
  // delegujemy do backendu, który zwróci PDF
  const resp = await apiFetch('/reports/users?' + params.toString());
  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = 'raport_uzytkownicy.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

// funkcje pomocnicze
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

// gotowe wywołanie przy starcie (jeśli chcesz)
document.addEventListener('DOMContentLoaded', () => {
  // jeśli masz elementy z id=collectionsGrid itp.
  if (document.querySelector('#collectionsGrid')) {
    loadCategoriesInto('#collectionsGrid');
  }
});
