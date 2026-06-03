const PAGE_SIZE = 10;
let investments = [];
let currentPage = 1;
let editingId = null;
let pieByName = null;
let pieByType = null;

// 注册 datalabels 插件（CDN 已加载到全局 ChartDataLabels）
if (window.ChartDataLabels) Chart.register(window.ChartDataLabels);

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
  dialogTitle.textContent = row ? '编辑资产配置' : '新增资产配置';
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
  const totalAmount = investments.reduce((s, r) => s + Number(r.amount || 0), 0);
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > maxPage) currentPage = maxPage;
  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = investments.slice(start, start + PAGE_SIZE);
  tbody.innerHTML = '';
  for (const row of slice) {
    const tr = document.createElement('tr');
    // 列顺序：产品名称、代码、类型、金额、平台、占比、操作
    tr.innerHTML = `
      <td></td><td></td><td></td><td></td><td></td><td></td>
      <td>
        <button class="row-action" data-act="edit">编辑</button>
        <button class="row-action danger" data-act="del">删除</button>
      </td>`;
    const tds = tr.querySelectorAll('td');
    tds[0].textContent = row.name;
    tds[1].textContent = row.code;
    tds[2].textContent = row.type;
    tds[3].textContent = Number(row.amount).toLocaleString();
    tds[4].textContent = row.platform;
    const pct = totalAmount > 0 ? (Number(row.amount || 0) / totalAmount * 100).toFixed(2) + '%' : '-';
    tds[5].textContent = pct;
    tr.querySelector('[data-act="edit"]').addEventListener('click', () => openDialog(row));
    tr.querySelector('[data-act="del"]').addEventListener('click', () => deleteRow(row.id));
    tbody.appendChild(tr);
  }
  pageInfo.textContent = `第 ${currentPage} / ${maxPage} 页 · 共 ${total} 条 · 总金额 ${totalAmount.toLocaleString()}`;
}

function aggregate(field) {
  const map = new Map();
  for (const r of investments) {
    const key = r[field] || '未分类';
    map.set(key, (map.get(key) || 0) + Number(r.amount || 0));
  }
  return { labels: [...map.keys()], data: [...map.values()] };
}

function buildPieConfig(labels, data) {
  const total = data.reduce((a, b) => a + b, 0);
  return {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map((_, i) => `hsl(${(i * 53) % 360} 70% 60%)`),
        borderColor: '#fff',
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed;
              const pct = total > 0 ? (v / total * 100).toFixed(1) : '0.0';
              return `${ctx.label}: ${Number(v).toLocaleString()} (${pct}%)`;
            },
          },
        },
        datalabels: {
          color: '#fff',
          font: { weight: 'bold', size: 12 },
          formatter: (value) => {
            if (!total || value / total < 0.03) return ''; // 占比 < 3% 隐藏避免重叠
            return (value / total * 100).toFixed(1) + '%';
          },
        },
      },
    },
  };
}

function renderCharts() {
  const byName = aggregate('name');
  const byType = aggregate('type');

  if (pieByName) pieByName.destroy();
  if (pieByType) pieByType.destroy();

  const ctx1 = document.getElementById('pie-name').getContext('2d');
  const ctx2 = document.getElementById('pie-type').getContext('2d');
  pieByName = new Chart(ctx1, buildPieConfig(byName.labels, byName.data));
  pieByType = new Chart(ctx2, buildPieConfig(byType.labels, byType.data));
}

async function loadInvestments() {
  const res = await fetch('/api/investments');
  if (res.status === 401) { location.href = '/'; return; }
  const data = await res.json();
  investments = data.items || [];
  renderTable();
  renderCharts();
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
