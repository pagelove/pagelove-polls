// Polls by Pagelove — create-poll form. Builds the option list the Liquid template expects,
// then lets the browser submit natively so it follows the 301 to the new poll page.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const form = $('#create');
const list = $('#options');
const errBox = $('#form-error');

function isoDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addRow(date = '', time = '') {
  const row = document.createElement('div');
  row.className = 'opt';
  row.innerHTML = `
    <input class="input" type="date" aria-label="Date" value="${date}">
    <input class="input" type="time" aria-label="Time (optional)" value="${time}">
    <button type="button" class="rm" aria-label="Remove this date">×</button>`;
  list.appendChild(row);
  return row;
}

// Seed with the next three days so the demo is one click away from working.
const today = new Date();
for (let i = 1; i <= 3; i++) {
  const d = new Date(today); d.setDate(today.getDate() + i);
  addRow(isoDate(d));
}

$('#add-option').addEventListener('click', () => {
  const row = addRow();
  row.querySelector('input[type="date"]').focus();
});

list.addEventListener('click', e => {
  const btn = e.target.closest('.rm');
  if (!btn) return;
  if ($$('.opt', list).length > 1) btn.closest('.opt').remove();
  else errBox.textContent = 'Keep at least one date.';
});

function optionRecord(date, time) {
  // The template expects: datetime|weekday|day month|time  (records joined by ;;)
  const d = new Date(`${date}T${time || '12:00'}`);
  const dow = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const datetime = time ? `${date}T${time}` : date;
  const clean = s => String(s).replace(/[|;]/g, ' ');
  return { datetime, text: [datetime, dow, day, time || ''].map(clean).join('|') };
}

form.addEventListener('submit', e => {
  e.preventDefault();
  errBox.textContent = '';

  const title = $('#title').value.trim();
  const organizer = $('#organizer').value.trim();
  if (!title) { errBox.textContent = 'Give the poll a title.'; $('#title').focus(); return; }
  if (!organizer) { errBox.textContent = 'Add your name so people know who is asking.'; $('#organizer').focus(); return; }

  const seen = new Set();
  const records = [];
  for (const row of $$('.opt', list)) {
    const date = row.querySelector('input[type="date"]').value;
    const time = row.querySelector('input[type="time"]').value;
    if (!date) continue;
    const rec = optionRecord(date, time);
    if (seen.has(rec.datetime)) continue;
    seen.add(rec.datetime);
    records.push(rec);
  }
  if (records.length === 0) { errBox.textContent = 'Add at least one date.'; return; }
  records.sort((a, b) => a.datetime.localeCompare(b.datetime));

  const now = new Date();
  $('#options-field').value = records.map(r => r.text).join(';;');
  $('#created-field').value = now.toISOString();
  $('#created-label-field').value = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  $('#submit-btn').disabled = true;
  $('#submit-btn').textContent = 'Creating…';
  // Native submission: the server answers 301 and the browser lands on the new poll.
  HTMLFormElement.prototype.submit.call(form);
});

// Response counts for the recent-polls list: one element-level GET per poll.
// GET /polls/<id>.html with Range: selector=#responses returns just the <tbody>.
for (const el of $$('.rc[data-src]')) {
  fetch(el.dataset.src, { headers: { 'Range': 'selector=#responses' } })
    .then(r => r.ok ? r.text() : Promise.reject(r.status))
    .then(html => {
      const t = document.createElement('template');
      t.innerHTML = `<table>${html}</table>`;
      const n = t.content.querySelectorAll('tr').length;
      el.textContent = n;
      el.nextSibling.textContent = n === 1 ? ' response' : ' responses';
    })
    .catch(() => { el.textContent = '?'; });
}
