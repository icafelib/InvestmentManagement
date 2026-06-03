const PAGE_SIZE = 10;
let investments = [];
let currentPage = 1;
let editingId = null;
let chart = null;

const tbody = document.querySelector('#invest-table tbody');
const pageInfo = document.getElementById('page-info');
const dialog = document.getElementById('row-dialog');
const dialogTitle = document.getElementById('dialog-title');
const rowForm = document.getElementById('row-form');

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/';
});

document.getElementById('add-btn').addEventListener('click', () => openDialog());
document.getElementById('cancel-row').addEventListener('click', () => dialog.close());
document.getElementById('prev-btn').addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); } });
document.getElementById('next-btn').addEventListener('click', () => {
  const max = Math.max(1, Math.ceil(investments.length / PAGE_SIZE));
  if (currentPage < max) { currentPage++; renderTable(); }
});

rowForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(rowForm);
  const payload = {
    code: fd.get('code').trim(),
    name: fd.get('name').trim(),
    type: fd.get('type'),
    amount: parseFloat(fd.get('amount')),
    platform: fd.get('platform').trim(),
  };
  if (editingId) payload.id = editingId;

  const res = await fetch('/api/investments', {
    method: editingId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    alert('保存失败');
    return;
  }
  dialog.close();
  await loadInvestments();
});

document.getElementById('save-tools-btn').addEventListener('click', async () => {
  const text = document.getElementById('tools-text').value;
  const status = document.getElementById('tools-status');
  status.textContent = '保存中…';
  const res = await fetch('/api/tools', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  status.textContent = res.ok ? '已保存' : '保存失败';
  setTimeout(() => (status.textContent = ''), 2000);
});

function openDialog(row) {
  editingId = row?.id || null;
  dialogTitle.textContent = row ? '编辑投资' : '新增投资';
  rowForm.reset();
  if (row) {
    rowForm.code.value = row.code;
    rowForm.name.value = row.name;
    rowForm.type.value = row.type;
    rowForm.amount.value = row.amount;
    rowForm.platform.value = row.platform;
  }
  dialog.showModal();
}

async function deleteRow(id) {
  if (!confirm('确认删除？')) return;
  const res = await fetch('/api/investments?id=' + encodeURIComponent(id), { method: 'DELETE' });
  if (!res.ok) { alert('删除失败'); return; }
  await loadInvestments();
}

function renderTable() {
  const total = investments.length;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > maxPage) currentPage = maxPage;
  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = investments.slice(start, start + PAGE_SIZE);
  tbody.innerHTML = '';
  for (const row of slice) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td></td><td></td><td></td><td></td><td></td>
      <td>
        <button class="row-action" data-act="edit">编辑</button>
        <button class="row-action danger" data-act="del">删除</button>
      </td>`;
    const tds = tr.querySelectorAll('td');
    tds[0].textContent = row.code;
    tds[1].textContent = row.name;
    tds[2].textContent = row.type;
    tds[3].textContent = Number(row.amount).toLocaleString();
    tds[4].textContent = row.platform;
    tr.querySelector('[data-act="edit"]').addEventListener('click', () => openDialog(row));
    tr.querySelector('[data-act="del"]').addEventListener('click', () => deleteRow(row.id));
    tbody.appendChild(tr);
  }
  pageInfo.textContent = `第 ${currentPage} / ${maxPage} 页 · 共 ${total} 条`;
}

function renderChart() {
  const map = new Map();
  for (const r of investments) {
    map.set(r.name, (map.get(r.name) || 0) + Number(r.amount || 0));
  }
  const labels = [...map.keys()];
  const data = [...map.values()];
  const ctx = document.getElementById('pie').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map((_, i) => `hsl(${(i * 53) % 360} 70% 60%)`),
      }],
    },
    options: { plugins: { legend: { position: 'right' } } },
  });
}

async function loadInvestments() {
  const res = await fetch('/api/investments');
  if (res.status === 401) { location.href = '/'; return; }
  const data = await res.json();
  investments = data.items || [];
  renderTable();
  renderChart();
}

async function loadTools() {
  const res = await fetch('/api/tools');
  if (res.status === 401) { location.href = '/'; return; }
  const data = await res.json();
  document.getElementById('tools-text').value = data.text || '';
}

async function loadMe() {
  const res = await fetch('/api/me');
  if (res.status === 401) { location.href = '/'; return; }
  const data = await res.json();
  document.getElementById('user-label').textContent = data.username;
}

(async () => {
  await loadMe();
  await loadInvestments();
  await loadTools();
})();
