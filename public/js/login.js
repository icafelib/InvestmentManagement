const form = document.getElementById('login-form');
const errorEl = document.getElementById('error');

// 自动填充记住的用户名
const remembered = localStorage.getItem('remember-username');
if (remembered) {
  document.getElementById('username').value = remembered;
  document.getElementById('remember').checked = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const remember = document.getElementById('remember').checked;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, remember }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errorEl.textContent = data.error || '登录失败';
      return;
    }
    if (remember) localStorage.setItem('remember-username', username);
    else localStorage.removeItem('remember-username');
    location.href = '/dashboard.html';
  } catch (err) {
    errorEl.textContent = '网络错误';
  }
});
