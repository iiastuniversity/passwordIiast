/* ===== Password Vault — SPA Logic with GitHub Gist Sync ===== */

const LS_ADMIN = 'pv_admin';     // admin credentials (এই device-এ)
const LS_GIST_ID = 'pv_gist_id'; // Gist ID (এই device-এ)
const LS_SESSION = 'pv_session'; // লগইন সেশন

let entries = [];
let editingId = null;
let gistToken = null; // শুধু মেমরিতে (সেশনে), ডিস্কে না
let syncTimer = null;

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
}

function toast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error-toast' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function setSync(state) {
  // state: 'ok' | 'syncing' | 'error'
  const el = $('sync-status');
  if (!el) return;
  el.textContent = state === 'ok' ? '☁️✓' : state === 'syncing' ? '🔄' : '☁️✗';
  el.title = state === 'ok' ? 'সব ডেটা Gist-এ sync আছে' : state === 'syncing' ? 'Sync হচ্ছে...' : 'Sync ব্যর্থ';
}

// ---------- Gist API ----------
const GIST_FILENAME = 'password-vault-data.json';

async function gistCreate(payload) {
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + gistToken,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: 'Password Vault Data',
      public: false,
      files: { [GIST_FILENAME]: { content: JSON.stringify(payload) } },
    }),
  });
  if (!res.ok) throw new Error('Gist তৈরি ব্যর্থ: ' + res.status);
  return await res.json();
}

async function gistRead(gistId) {
  const res = await fetch('https://api.github.com/gists/' + gistId, {
    headers: {
      Authorization: 'Bearer ' + gistToken,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) throw new Error('Gist পড়া ব্যর্থ: ' + res.status);
  const data = await res.json();
  const file = data.files[GIST_FILENAME];
  if (!file) throw new Error('Gist-এ ডেটা ফাইল নেই');
  return JSON.parse(file.content);
}

async function gistUpdate(gistId, payload) {
  const res = await fetch('https://api.github.com/gists/' + gistId, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + gistToken,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: { [GIST_FILENAME]: { content: JSON.stringify(payload) } },
    }),
  });
  if (!res.ok) throw new Error('Gist আপডেট ব্যর্থ: ' + res.status);
}

// ---------- Sync ----------
function syncToGist() {
  // বারবার সেভে একসাথে একবারই sync হবে (debounce)
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const gistId = localStorage.getItem(LS_GIST_ID);
    const admin = localStorage.getItem(LS_ADMIN);
    if (!gistId || !gistToken || !admin) return;
    setSync('syncing');
    try {
      await gistUpdate(gistId, { admin: JSON.parse(admin), entries });
      setSync('ok');
    } catch (err) {
      setSync('error');
      toast('Sync ব্যর্থ: ' + err.message, true);
    }
  }, 800);
}

// ---------- Screen Management ----------
function showAuth() {
  $('auth-screen').classList.remove('hidden');
  $('dashboard-screen').classList.add('hidden');
  const admin = localStorage.getItem(LS_ADMIN);
  if (admin) {
    $('login-form').classList.remove('hidden');
    $('register-form').classList.add('hidden');
    // এই device-এ Gist ID না থাকলে (নতুন browser) login-এ চাওয়া হবে
    const hasGist = !!localStorage.getItem(LS_GIST_ID);
    $('login-gist').classList.toggle('hidden', hasGist);
    $('login-token').classList.toggle('hidden', hasGist && !!sessionStorage.getItem('pv_token'));
  } else {
    $('register-form').classList.remove('hidden');
    $('login-form').classList.add('hidden');
  }
}

function showDashboard() {
  $('auth-screen').classList.add('hidden');
  $('dashboard-screen').classList.remove('hidden');
  const admin = JSON.parse(localStorage.getItem(LS_ADMIN));
  $('admin-name').textContent = '👤 ' + admin.username;
  renderEntries();
  // Browser auto-fill দিয়ে এন্ট্রি ফর্মে লগইন তথ্য বসে গেলে মুছে ফেলা
  setTimeout(() => {
    if (!editingId) {
      ['entry-username', 'entry-email', 'entry-password'].forEach((id) => {
        const f = $(id);
        if (f && !f.dataset.touched) f.value = '';
      });
    }
  }, 300);
}

// ইউজার নিজে কিছু টাইপ করলে আর মুছবে না
['entry-username', 'entry-email', 'entry-password'].forEach((id) => {
  document.addEventListener('input', (e) => {
    if (e.target.id === id) e.target.dataset.touched = '1';
  });
});

// ---------- Register (একবারই — প্রথম device-এ) ----------
$('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (localStorage.getItem(LS_ADMIN)) {
    $('reg-error').textContent = 'এই browser-এ Admin ইতিমধ্যে আছে!';
    showAuth();
    return;
  }
  const u = $('reg-username').value.trim();
  const p1 = $('reg-password').value;
  const p2 = $('reg-password2').value;
  const token = $('reg-token').value.trim();
  if (p1 !== p2) {
    $('reg-error').textContent = 'দুটি পাসওয়ার্ড মিলছে না!';
    return;
  }

  gistToken = token;
  $('reg-error').textContent = 'Gist তৈরি হচ্ছে...';
  const adminData = { username: u, passwordHash: hash(p1) };

  try {
    const gist = await gistCreate({ admin: adminData, entries: [] });
    localStorage.setItem(LS_ADMIN, JSON.stringify(adminData));
    localStorage.setItem(LS_GIST_ID, gist.id);
    localStorage.setItem(LS_SESSION, '1');
    sessionStorage.setItem('pv_token', token);
    entries = [];
    toast('Admin তৈরি হয়েছে! ডেটা Gist-এ সেভ হবে।');
    $('register-form').reset();
    setSync('ok');
    showDashboard();
  } catch (err) {
    gistToken = null;
    $('reg-error').textContent = err.message + ' — Token আবার চেক করুন';
  }
});

// ---------- Login ----------
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  const u = $('login-username').value.trim();
  const p = $('login-password').value;
  const gistIdField = $('login-gist');
  const tokenField = $('login-token');
  let gistId = localStorage.getItem(LS_GIST_ID);

  // নতুন device-এ Gist ID লাগবে
  if (!gistId) {
    gistId = gistIdField.value.trim();
    if (!gistId) {
      $('login-error').textContent = 'Gist ID দিন (প্রথমবার এই device-এ)';
      gistIdField.classList.remove('hidden');
      return;
    }
  }

  // token: সেশনে থাকলে নেই, না থাকলে ফর্ম থেকে
  gistToken = sessionStorage.getItem('pv_token') || tokenField.value.trim() || gistToken;
  if (!gistToken) {
    $('login-error').textContent = 'GitHub Token দিন (Gist পড়তে লাগবে)';
    tokenField.classList.remove('hidden');
    return;
  }
  try {
    const remote = await gistRead(gistId);
    if (remote.admin.username === u && remote.admin.passwordHash === hash(p)) {
      localStorage.setItem(LS_ADMIN, JSON.stringify(remote.admin));
      localStorage.setItem(LS_GIST_ID, gistId);
      localStorage.setItem(LS_SESSION, '1');
      sessionStorage.setItem('pv_token', gistToken);
      entries = remote.entries || [];
      $('login-form').reset();
      setSync('ok');
      showDashboard();
    } else {
      $('login-error').textContent = 'ভুল ইউজারনেম বা পাসওয়ার্ড!';
    }
  } catch (err) {
    // অফলাইন fallback: লোকাল admin মিলিয়ে দেখি
    const local = JSON.parse(localStorage.getItem(LS_ADMIN) || 'null');
    if (local && local.username === u && local.passwordHash === hash(p)) {
      localStorage.setItem(LS_SESSION, '1');
      toast('অফলাইন মোড — লোকাল ডেটা দেখানো হচ্ছে');
      showDashboard();
    } else {
      $('login-error').textContent = 'লগইন ব্যর্থ: ' + err.message;
    }
  }
});

// ---------- Logout ----------
$('logout-btn').addEventListener('click', () => {
  localStorage.removeItem(LS_SESSION);
  gistToken = null;
  sessionStorage.removeItem('pv_token');
  showAuth();
});

// ---------- Add / Edit Entry ----------
$('entry-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    website: $('entry-website').value.trim(),
    url: $('entry-url').value.trim(),
    username: $('entry-username').value.trim(),
    email: $('entry-email').value.trim(),
    password: $('entry-password').value,
    note: $('entry-note').value.trim(),
  };
  if (editingId) {
    const idx = entries.findIndex((x) => x.id === editingId);
    if (idx > -1) entries[idx] = { ...entries[idx], ...data };
    toast('এন্ট্রি আপডেট হয়েছে!');
    cancelEdit();
  } else {
    entries.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), createdAt: Date.now(), ...data });
    toast('নতুন এন্ট্রি সংরক্ষিত!');
  }
  $('entry-form').reset();
  renderEntries();
  syncToGist();
});

function cancelEdit() {
  editingId = null;
  $('form-title').textContent = 'নতুন এন্ট্রি যোগ করুন';
  $('save-btn').textContent = 'সংরক্ষণ করুন';
  $('cancel-edit').classList.add('hidden');
  $('entry-form').reset();
}

$('cancel-edit').addEventListener('click', cancelEdit);

// ---------- Render Entries ----------
function renderEntries(filter = '') {
  const list = $('entries-list');
  const q = filter.toLowerCase();
  const filtered = entries.filter((en) =>
    [en.website, en.username, en.email, en.note].some((f) => (f || '').toLowerCase().includes(q))
  );

  $('entry-count').textContent = filtered.length + ' টি এন্ট্রি';
  $('empty-state').classList.toggle('hidden', entries.length > 0);
  list.innerHTML = '';

  filtered.forEach((en) => {
    const card = document.createElement('div');
    card.className = 'entry-card';
    const letter = (en.website || '?').charAt(0).toUpperCase();
    card.innerHTML = `
      <div class="entry-site">
        <div class="favicon">${esc(letter)}</div>
        <div>
          <h3>${esc(en.website)}</h3>
          ${en.url ? `<a href="${esc(en.url)}" target="_blank" rel="noopener">${esc(en.url)}</a>` : ''}
        </div>
      </div>
      ${en.username ? `<div class="entry-row"><span class="label">ইউজারনেম</span><span class="value">${esc(en.username)}</span><button class="copy-btn" data-copy="${esc(en.username)}">কপি</button></div>` : ''}
      ${en.email ? `<div class="entry-row"><span class="label">ইমেইল</span><span class="value">${esc(en.email)}</span><button class="copy-btn" data-copy="${esc(en.email)}">কপি</button></div>` : ''}
      <div class="entry-row">
        <span class="label">পাসওয়ার্ড</span>
        <span class="value pass-value" data-pass="${esc(en.password)}">••••••••</span>
        <span>
          <button class="copy-btn toggle-pass">👁</button>
          <button class="copy-btn" data-copy="${esc(en.password)}">কপি</button>
        </span>
      </div>
      ${en.note ? `<p class="entry-note">📝 ${esc(en.note)}</p>` : ''}
      <div class="entry-actions">
        <button class="btn btn-secondary edit-btn" data-id="${en.id}">✏️ এডিট</button>
        <button class="btn btn-danger del-btn" data-id="${en.id}">🗑 মুছুন</button>
      </div>
    `;
    list.appendChild(card);
  });
}

// ---------- List Actions ----------
$('entries-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.dataset.copy !== undefined) {
    navigator.clipboard.writeText(btn.dataset.copy).then(() => toast('কপি হয়েছে!'));
    return;
  }

  if (btn.classList.contains('toggle-pass')) {
    const span = btn.closest('.entry-row').querySelector('.pass-value');
    span.textContent = span.textContent === '••••••••' ? span.dataset.pass : '••••••••';
    return;
  }

  if (btn.classList.contains('edit-btn')) {
    const en = entries.find((x) => x.id === btn.dataset.id);
    if (!en) return;
    editingId = en.id;
    $('entry-website').value = en.website;
    $('entry-url').value = en.url;
    $('entry-username').value = en.username;
    $('entry-email').value = en.email;
    $('entry-password').value = en.password;
    $('entry-note').value = en.note;
    $('form-title').textContent = 'এন্ট্রি এডিট করুন';
    $('save-btn').textContent = 'আপডেট করুন';
    $('cancel-edit').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (btn.classList.contains('del-btn')) {
    if (!confirm('আপনি কি নিশ্চিত এই এন্ট্রি মুছে ফেলতে চান?')) return;
    entries = entries.filter((x) => x.id !== btn.dataset.id);
    renderEntries($('search-input').value);
    syncToGist();
    toast('এন্ট্রি মুছে ফেলা হয়েছে');
  }
});

// ---------- Search ----------
$('search-input').addEventListener('input', (e) => renderEntries(e.target.value));

// ---------- Password show/hide & generator ----------
document.querySelectorAll('.eye-btn').forEach((b) =>
  b.addEventListener('click', () => {
    const inp = $(b.dataset.target);
    inp.type = inp.type === 'password' ? 'text' : 'password';
  })
);

$('gen-password').addEventListener('click', () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  const arr = new Uint32Array(16);
  crypto.getRandomValues(arr);
  let pass = '';
  arr.forEach((n) => (pass += chars[n % chars.length]));
  const inp = $('entry-password');
  inp.value = pass;
  inp.type = 'text';
  toast('শক্তিশালী পাসওয়ার্ড তৈরি হয়েছে!');
});

// ---------- Init ----------
(async function init() {
  if (localStorage.getItem(LS_SESSION) && localStorage.getItem(LS_ADMIN)) {
    // সেশন আছে — Gist থেকে লেটেস্ট ডেটা টানার চেষ্টা করি
    const gistId = localStorage.getItem(LS_GIST_ID);
    const token = sessionStorage.getItem('pv_token');
    if (gistId && token) {
      gistToken = token;
      try {
        const remote = await gistRead(gistId);
        entries = remote.entries || [];
        localStorage.setItem(LS_ADMIN, JSON.stringify(remote.admin));
        setSync('ok');
      } catch {
        setSync('error');
      }
    }
    showDashboard();
  } else {
    showAuth();
  }
})();

