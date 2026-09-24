// Polls by Pagelove — poll page. The document is the database:
//   vote      = POST   <tr> with Range: selector=#responses
//   edit      = PUT    the row   with Range: selector=#r-xxxx
//   withdraw  = DELETE the row   with Range: selector=#r-xxxx
//   live      = EventSource on this URL; mutation events are applied to the DOM.

const POLL = location.pathname;
const RESP_TYPE = 'https://pagelove.org/PollResponse';
const CYCLE = { no: 'yes', yes: 'ifneedbe', ifneedbe: 'no' };
const LABEL = { yes: 'Yes', ifneedbe: 'If need be', no: 'No' };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const optionIds = $$('#grid thead th[data-option]').map(th => th.dataset.option);
const optionLabel = id => [...$$(`#grid thead th[data-option="${id}"] time > span`)].map(s => s.textContent.trim()).filter(Boolean).join(' ') || id;

// ---------- ownership (no login: remember rows this browser created) ----------
const OWN_KEY = 'polls-by-pagelove:own:' + POLL;
let own = new Set();
try { own = new Set(JSON.parse(localStorage.getItem(OWN_KEY) || '[]')); } catch (_) {}
function saveOwn() { try { localStorage.setItem(OWN_KEY, JSON.stringify([...own])); } catch (_) {} }

let editing = null;   // row id currently being edited, or null
let conn = null;      // SSE connection token, echoed back on writes

// ---------- share link ----------
$('#share-url').value = location.origin + POLL;
$('#copy-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.origin + POLL); setStatus('Link copied'); }
  catch (_) { $('#share-url').select(); setStatus('Press ⌘C / Ctrl+C to copy'); }
});

// ---------- entry row ----------
function setVote(btn, v) {
  btn.dataset.vote = v;
  btn.textContent = v;
  btn.setAttribute('aria-label', `${LABEL[v]} for ${optionLabel(btn.closest('td').dataset.option)}. Click to change.`);
}
$$('#entry .vote').forEach(b => {
  setVote(b, 'no');
  b.addEventListener('click', () => setVote(b, CYCLE[b.dataset.vote]));
});
$('#entry-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#save').click(); } });

function readEntry() {
  const votes = {};
  $$('#entry .vote').forEach(b => { votes[b.closest('td').dataset.option] = b.dataset.vote; });
  return { name: $('#entry-name').value.trim(), votes };
}
function resetEntry() {
  $('#entry-name').value = '';
  $$('#entry .vote').forEach(b => setVote(b, 'no'));
}
function rowHtml(id, name, votes) {
  const cells = optionIds.map(o => {
    const v = votes[o] || 'no';
    return `<td itemprop="vote" data-option="${o}" data-vote="${v}">${v}</td>`;
  }).join('');
  return `<tr id="${id}" itemscope itemtype="${RESP_TYPE}"><th scope="row" itemprop="name">${esc(name)}</th>${cells}</tr>`;
}
function parseFragment(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function rowData(tr) {
  const name = tr.querySelector('[itemprop="name"]');
  const nameText = name ? [...name.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : '';
  const votes = {};
  tr.querySelectorAll('td[data-option]').forEach(td => { votes[td.dataset.option] = td.dataset.vote || 'no'; });
  return { name: nameText, votes };
}

// ---------- HTTP against this document ----------
async function request(method, selector, body) {
  const headers = { 'Range': 'selector=' + selector };
  if (body != null) headers['Content-Type'] = 'text/html';
  if (conn) headers['Pagelove-Connection'] = conn;
  let res;
  try { res = await fetch(POLL, { method, headers, body }); }
  catch (err) { log({ method, selector, body, status: 'network error' }); throw err; }
  log({ method, selector, body, status: res.status });
  return res;
}
function explain(res) {
  if (res.status === 422) return 'Rejected by the ShapeConstraint (422). Only a name and vote cells are allowed in a row.';
  if (res.status === 401 || res.status === 403) return `Not allowed (${res.status}). The AuthorizationRules do not permit this write.`;
  if (res.status === 416) return 'That row no longer exists (416).';
  return `Request failed (${res.status}).`;
}

// ---------- save / update ----------
$('#save').addEventListener('click', async () => {
  const { name, votes } = readEntry();
  if (!name) { setStatus('Add your name first.', true); $('#entry-name').focus(); return; }
  $('#save').disabled = true;
  try {
    if (editing) {
      const html = rowHtml(editing, name, votes);
      const res = await request('PUT', '#' + editing, html);
      if (!res.ok) return setStatus(explain(res), true);
      const fresh = parseFragment(await res.text()) || parseFragment(html);
      $('#' + CSS.escape(editing))?.replaceWith(fresh);
      setStatus(`Updated ${name}'s availability.`);
      finishEdit();
    } else {
      const id = 'r-' + Math.random().toString(36).slice(2, 10);
      const html = rowHtml(id, name, votes);
      const res = await request('POST', '#responses', html);
      if (!res.ok) return setStatus(explain(res), true);
      const fresh = parseFragment(await res.text()) || parseFragment(html);
      if (!fresh.id) fresh.id = id;
      $('#responses').appendChild(fresh);
      own.add(fresh.id); saveOwn();
      resetEntry();
      setStatus(`Saved. Thanks, ${name}!`);
    }
  } finally {
    $('#save').disabled = false;
    refresh();
  }
});

function startEdit(tr) {
  editing = tr.id;
  const { name, votes } = rowData(tr);
  $('#entry-name').value = name;
  $$('#entry .vote').forEach(b => setVote(b, votes[b.closest('td').dataset.option] || 'no'));
  $('#save').textContent = 'Update my availability';
  $('#cancel').hidden = false;
  tr.classList.add('editing');
  $('#entry-name').focus();
  setStatus(`Editing ${name}'s row.`);
}
function finishEdit() {
  editing = null;
  $$('#responses tr.editing').forEach(tr => tr.classList.remove('editing'));
  $('#save').textContent = 'Save my availability';
  $('#cancel').hidden = true;
  resetEntry();
}
$('#cancel').addEventListener('click', () => { finishEdit(); setStatus(''); });

$('#responses').addEventListener('click', async e => {
  const btn = e.target.closest('.row-actions button');
  if (!btn) return;
  const tr = btn.closest('tr');
  if (btn.classList.contains('edit')) return startEdit(tr);
  if (btn.classList.contains('rm')) {
    const res = await request('DELETE', '#' + tr.id);
    if (!res.ok) return setStatus(explain(res), true);
    if (editing === tr.id) finishEdit();
    tr.remove(); own.delete(tr.id); saveOwn();
    setStatus('Response withdrawn.');
    refresh();
  }
});

// ---------- derived UI: counts, best column, own-row controls ----------
function refresh() {
  const rows = $$('#responses > tr');
  const yes = {}, maybe = {};
  optionIds.forEach(o => { yes[o] = 0; maybe[o] = 0; });
  rows.forEach(tr => {
    tr.querySelectorAll('td[data-option]').forEach(td => {
      if (td.dataset.vote === 'yes') yes[td.dataset.option]++;
      else if (td.dataset.vote === 'ifneedbe') maybe[td.dataset.option]++;
    });
  });
  const top = Math.max(0, ...Object.values(yes));
  optionIds.forEach(o => {
    const foot = $(`#grid tfoot td[data-option="${o}"]`);
    if (foot) {
      foot.querySelector('.count').textContent = yes[o];
      foot.querySelector('.maybe').textContent = maybe[o] ? `+${maybe[o]} if need be` : '';
    }
    const best = top > 0 && yes[o] === top;
    $$(`#grid [data-option="${o}"]`).forEach(cell => cell.classList.toggle('best', best));
    const th = $(`#grid thead th[data-option="${o}"]`);
    if (th) {
      let tag = th.querySelector('.best-tag');
      if (best && !tag) { tag = document.createElement('span'); tag.className = 'best-tag'; tag.textContent = 'Best'; th.appendChild(tag); }
      if (!best && tag) tag.remove();
    }
  });
  rows.forEach(tr => {
    const mine = own.has(tr.id);
    tr.classList.toggle('own', mine);
    const th = tr.querySelector('[itemprop="name"]');
    let actions = th?.querySelector('.row-actions');
    if (mine && th && !actions) {
      actions = document.createElement('span');
      actions.className = 'row-actions';
      actions.innerHTML = '<button type="button" class="edit">Edit</button><button type="button" class="rm">Remove</button>';
      th.appendChild(actions);
    }
    if (!mine && actions) actions.remove();
  });
  $('#empty').hidden = rows.length > 0;
}

// ---------- live updates ----------
const es = new EventSource(POLL);
es.addEventListener('pagelove-connection', e => { conn = e.data; });
// The payload is an HTML Microdata <article>. Metadata spans parse fine with DOMParser, but the
// <div itemprop="body"> holds table rows, which an HTML parser drops outside a <table> — so the
// body is sliced out of the raw text and parsed via <template>, which accepts top-level <tr>.
function parseMutation(data) {
  const doc = new DOMParser().parseFromString(data, 'text/html');
  const prop = p => doc.querySelector(`[itemprop="${p}"]`)?.textContent.trim();
  const open = '<div itemprop="body">';
  const start = data.indexOf(open);
  const end = data.lastIndexOf('</div>');
  const body = start >= 0 && end > start ? data.slice(start + open.length, end) : '';
  return { method: prop('method'), selector: prop('selector'), path: prop('path'), placement: prop('placement') || 'append', body };
}
es.addEventListener('mutation', e => {
  const { method, selector, path, placement, body } = parseMutation(e.data);
  if (path && path !== POLL) return;
  const target = selector && document.querySelector(selector);
  if (!target) return;
  if (method === 'DELETE') {
    if (editing === target.id) finishEdit();
    target.remove();
  } else {
    const node = parseFragment(body);
    if (!node) return;
    if (method === 'PUT') target.replaceWith(node);
    else if (method === 'POST') {
      if (placement === 'prepend') target.prepend(node);
      else if (placement === 'before') target.before(node);
      else if (placement === 'after') target.after(node);
      else target.append(node);
    }
  }
  log({ incoming: true, method, selector });
  refresh();
});
es.addEventListener('reset', () => location.reload());

// ---------- status + under-the-hood log ----------
let statusTimer;
function setStatus(msg, isErr = false) {
  const el = $('#status');
  el.textContent = msg;
  el.classList.toggle('err', isErr);
  clearTimeout(statusTimer);
  if (msg && !isErr) statusTimer = setTimeout(() => { el.textContent = ''; }, 5000);
}
function log({ method, selector, body, status, incoming }) {
  const ol = $('#log');
  ol.querySelector('.none')?.remove();
  const li = document.createElement('li');
  if (incoming) li.className = 'in';
  li.innerHTML = incoming
    ? `<div class="ln"><span class="m">SSE ▸ ${esc(method)}</span><code>${esc(selector)}</code><span class="st">applied to DOM</span></div>`
    : `<div class="ln"><span class="m">${esc(method)}</span><code>${esc(POLL)}</code><code>Range: selector=${esc(selector)}</code><span class="st">→ ${esc(status)}</span></div>${body ? `<pre>${esc(body)}</pre>` : ''}`;
  ol.prepend(li);
  while (ol.children.length > 12) ol.lastElementChild.remove();
}

refresh();
