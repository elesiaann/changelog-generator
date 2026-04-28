/* ─── Changelog Generator ───────────────────────────────────────────────────── */

const STORAGE_KEY = 'changelog_data';

/* ── State ── */
let state = {
  projectName: '',
  repoUrl: '',
  releases: [],
};

let editTarget = null; // { releaseId, entryId }
let activeReleaseType = 'stable';
let activeTab = 'releases';

/* ── Helpers ── */
const $ = id => document.getElementById(id);
const uid = () => '_' + Math.random().toString(36).slice(2, 9);
const today = () => new Date().toISOString().split('T')[0];
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ── Type config ── */
const TYPE_CONFIG = {
  Added:      { color: '#10b981', emoji: '✨' },
  Fixed:      { color: '#3b82f6', emoji: '🐛' },
  Changed:    { color: '#f59e0b', emoji: '🔄' },
  Removed:    { color: '#ef4444', emoji: '🗑️' },
  Deprecated: { color: '#f97316', emoji: '⚠️' },
  Security:   { color: '#a78bfa', emoji: '🔒' },
};

const CONVENTIONAL_MAP = {
  feat:     'Added',
  feature:  'Added',
  add:      'Added',
  fix:      'Fixed',
  bugfix:   'Fixed',
  bug:      'Fixed',
  change:   'Changed',
  refactor: 'Changed',
  perf:     'Changed',
  update:   'Changed',
  remove:   'Removed',
  delete:   'Removed',
  deprecate:'Deprecated',
  security: 'Security',
  sec:      'Security',
  docs:     'Changed',
  style:    'Changed',
  chore:    'Changed',
  test:     'Changed',
  ci:       'Changed',
  build:    'Changed',
};

/* ── Persistence ── */
function load() {
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || state; } catch { /* empty */ }
  if (!Array.isArray(state.releases)) state.releases = [];
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ── Toast ── */
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

/* ── Tab Navigation ── */
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  $(`tab-${tab}`).classList.add('active');
  renderOutput();
}
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

/* ── Release Type Selector ── */
$('releaseTagRow').querySelectorAll('.tag-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $('releaseTagRow').querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeReleaseType = btn.dataset.rel;
  });
});

/* ── Add Release ── */
$('releaseDate').value = today();

$('btnAddRelease').addEventListener('click', () => {
  const version = $('releaseVersion').value.trim();
  if (!version) { toast('Enter a version number.', 'error'); return; }

  const exists = state.releases.find(r => r.version === version);
  if (exists) { toast(`Version ${version} already exists.`, 'error'); return; }

  const release = {
    id:      uid(),
    version,
    date:    $('releaseDate').value || today(),
    type:    activeReleaseType,
    entries: [],
  };

  state.releases.unshift(release);
  save();
  $('releaseVersion').value = '';
  $('releaseDate').value = today();

  // reset type to stable
  $('releaseTagRow').querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
  $('releaseTagRow').querySelector('[data-rel="stable"]').classList.add('active');
  activeReleaseType = 'stable';

  updateReleaseSelects();
  renderAll();
  toast(`Release ${version} added!`);
});

/* ── Parse Git Log ── */
$('btnParseLog').addEventListener('click', () => {
  const log   = $('gitLogInput').value.trim();
  const relId = $('parseTargetRelease').value;
  const errEl = $('parseError');

  errEl.className = 'hidden';

  if (!log) { showParseMsg('Paste a git log first.', 'error'); return; }
  if (!relId) { showParseMsg('Select a release to add entries to.', 'error'); return; }

  const release = state.releases.find(r => r.id === relId);
  if (!release) return;

  const lines = log.split('\n').map(l => l.trim()).filter(Boolean);
  let added = 0;

  lines.forEach(line => {
    // Format: <hash> <type>(<scope>): <description>  OR  <hash> <description>
    const match = line.match(/^([a-f0-9]{4,40})\s+(.+)$/i);
    const raw   = match ? match[2] : line;
    const hash  = match ? match[1].slice(0, 7) : '';

    // Parse conventional commit
    const convMatch = raw.match(/^(\w+)(?:\([\w/-]+\))?[!]?:\s*(.+)$/);
    let type = 'Changed';
    let desc = raw;

    if (convMatch) {
      const prefix = convMatch[1].toLowerCase();
      type = CONVENTIONAL_MAP[prefix] || 'Changed';
      desc = convMatch[2];
    }

    // Capitalise first letter
    desc = desc.charAt(0).toUpperCase() + desc.slice(1);

    release.entries.push({ id: uid(), type, desc, hash });
    added++;
  });

  if (added === 0) {
    showParseMsg('No commits parsed. Check the format.', 'error');
    return;
  }

  save();
  $('gitLogInput').value = '';
  showParseMsg(`${added} commit${added > 1 ? 's' : ''} added to v${release.version}!`, 'success');
  renderAll();
});

function showParseMsg(msg, type) {
  const el = $('parseError');
  el.textContent = msg;
  el.className = type === 'error' ? 'parse-error' : 'parse-success';
  setTimeout(() => { el.className = 'hidden'; }, 3500);
}

/* ── Add Manual Entry ── */
$('btnAddEntry').addEventListener('click', () => {
  const relId = $('entryTargetRelease').value;
  const desc  = $('entryDesc').value.trim();
  const type  = $('entryType').value;
  const hash  = $('entryHash').value.trim().slice(0, 7);

  if (!relId) { toast('Select a release.', 'error'); return; }
  if (!desc)  { toast('Enter a description.', 'error'); return; }

  const release = state.releases.find(r => r.id === relId);
  if (!release) return;

  release.entries.push({ id: uid(), type, desc, hash });
  save();
  $('entryDesc').value = '';
  $('entryHash').value = '';
  renderAll();
  toast('Entry added!');
});

/* ── Delete Release ── */
function deleteRelease(id) {
  if (!confirm('Delete this release and all its entries?')) return;
  state.releases = state.releases.filter(r => r.id !== id);
  save();
  updateReleaseSelects();
  renderAll();
  toast('Release deleted.');
}

/* ── Delete Entry ── */
function deleteEntry(releaseId, entryId) {
  const rel = state.releases.find(r => r.id === releaseId);
  if (!rel) return;
  rel.entries = rel.entries.filter(e => e.id !== entryId);
  save();
  renderAll();
}

/* ── Edit Entry Modal ── */
function openEditEntry(releaseId, entryId) {
  const rel   = state.releases.find(r => r.id === releaseId);
  const entry = rel?.entries.find(e => e.id === entryId);
  if (!entry) return;
  editTarget = { releaseId, entryId };
  $('editType').value = entry.type;
  $('editDesc').value = entry.desc;
  $('editHash').value = entry.hash || '';
  $('editOverlay').classList.add('open');
}

function closeEdit() {
  $('editOverlay').classList.remove('open');
  editTarget = null;
}

$('closeEdit').addEventListener('click', closeEdit);
$('cancelEdit').addEventListener('click', closeEdit);
$('editOverlay').addEventListener('click', e => { if (e.target === $('editOverlay')) closeEdit(); });

$('confirmEdit').addEventListener('click', () => {
  if (!editTarget) return;
  const rel   = state.releases.find(r => r.id === editTarget.releaseId);
  const entry = rel?.entries.find(e => e.id === editTarget.entryId);
  if (!entry) return;
  entry.type = $('editType').value;
  entry.desc = $('editDesc').value.trim() || entry.desc;
  entry.hash = $('editHash').value.trim().slice(0, 7);
  save();
  closeEdit();
  renderAll();
  toast('Entry updated.');
});

/* ── Update release selects ── */
function updateReleaseSelects() {
  const options = state.releases.length
    ? state.releases.map(r => `<option value="${r.id}">v${esc(r.version)}</option>`).join('')
    : '<option value="">— no releases yet —</option>';

  $('parseTargetRelease').innerHTML = '<option value="">— select release —</option>' + options;
  $('entryTargetRelease').innerHTML = '<option value="">— select —</option>' + options;
}

/* ── Project Info sync ── */
$('projectName').addEventListener('input', () => {
  state.projectName = $('projectName').value.trim();
  save();
  renderOutput();
});
$('repoUrl').addEventListener('input', () => {
  state.repoUrl = $('repoUrl').value.trim();
  save();
  renderOutput();
});

/* ── Generate Markdown ── */
function generateMarkdown() {
  const name    = state.projectName || 'Changelog';
  const repoUrl = state.repoUrl.replace(/\/$/, '');
  const lines   = [];

  lines.push(`# ${name} Changelog`);
  lines.push('');
  lines.push('All notable changes to this project will be documented in this file.');
  lines.push('');
  lines.push('The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),');
  lines.push('and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).');
  lines.push('');

  if (state.releases.length === 0) {
    lines.push('## [Unreleased]');
    lines.push('');
    return lines.join('\n');
  }

  state.releases.forEach(rel => {
    const yanked = rel.type === 'yanked' ? ' [YANKED]' : '';
    const pre    = rel.type === 'pre' ? '-pre' : '';
    const versionLink = repoUrl
      ? `[${rel.version}${pre}](${repoUrl}/releases/tag/v${rel.version})`
      : `${rel.version}${pre}`;
    lines.push(`## [${versionLink}] - ${rel.date}${yanked}`);
    lines.push('');

    if (rel.entries.length === 0) {
      lines.push('_No changes documented._');
      lines.push('');
      return;
    }

    const grouped = groupEntries(rel.entries);
    Object.entries(grouped).forEach(([type, entries]) => {
      lines.push(`### ${type}`);
      entries.forEach(e => {
        const hashPart = e.hash
          ? (repoUrl ? ` ([${e.hash}](${repoUrl}/commit/${e.hash}))` : ` (${e.hash})`)
          : '';
        lines.push(`- ${e.desc}${hashPart}`);
      });
      lines.push('');
    });
  });

  return lines.join('\n');
}

function groupEntries(entries) {
  const order = ['Added', 'Fixed', 'Changed', 'Deprecated', 'Removed', 'Security'];
  const groups = {};
  entries.forEach(e => {
    if (!groups[e.type]) groups[e.type] = [];
    groups[e.type].push(e);
  });
  const sorted = {};
  order.forEach(t => { if (groups[t]) sorted[t] = groups[t]; });
  Object.keys(groups).forEach(t => { if (!sorted[t]) sorted[t] = groups[t]; });
  return sorted;
}

/* ── Render Releases ── */
function renderReleases() {
  const list = $('releaseList');
  if (state.releases.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>No releases yet.<br>Add a release version to get started!</p>
      </div>`;
    return;
  }

  list.innerHTML = state.releases.map(rel => {
    const badgeClass = { stable: 'badge-stable', pre: 'badge-pre', yanked: 'badge-yanked' }[rel.type];
    const badgeText  = { stable: 'Stable', pre: 'Pre-release', yanked: 'Yanked' }[rel.type];
    const grouped    = groupEntries(rel.entries);

    const entriesHtml = rel.entries.length === 0
      ? `<p style="color:var(--text-muted);font-size:.82rem;padding:4px 0">No entries yet — parse a git log or add manually.</p>`
      : Object.entries(grouped).map(([type, entries]) => {
          const cfg = TYPE_CONFIG[type] || { color: '#8892a4', emoji: '•' };
          const rows = entries.map(e => `
            <div class="entry-row">
              <span class="entry-bullet">–</span>
              <span class="entry-text">${esc(e.desc)}</span>
              ${e.hash ? `<span class="entry-hash">${esc(e.hash)}</span>` : ''}
              <span class="entry-actions">
                <button class="btn-icon" onclick="openEditEntry('${rel.id}','${e.id}')" title="Edit">✏️</button>
                <button class="btn-icon" onclick="deleteEntry('${rel.id}','${e.id}')" title="Delete">🗑</button>
              </span>
            </div>`).join('');
          return `
            <div class="entry-group">
              <div class="entry-group-title">
                <span class="type-dot" style="background:${cfg.color}"></span>
                ${cfg.emoji} ${type}
              </div>
              ${rows}
            </div>`;
        }).join('');

    return `
      <div class="release-card">
        <div class="release-card-header">
          <span class="release-version">v${esc(rel.version)}</span>
          <span class="release-date">📅 ${rel.date}</span>
          <span class="release-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="release-card-body">${entriesHtml}</div>
        <div class="release-card-footer">
          <button class="btn btn-danger btn-sm" onclick="deleteRelease('${rel.id}')">Delete Release</button>
        </div>
      </div>`;
  }).join('');
}

/* ── Render Markdown Preview ── */
function renderPreview() {
  const md   = generateMarkdown();
  const name = state.projectName || 'Changelog';
  const repo = state.repoUrl.replace(/\/$/, '');
  let html   = '';

  html += `<h1>📋 ${esc(name)} Changelog</h1>`;
  html += `<p>All notable changes to this project will be documented in this file.<br>
    Format: <a href="https://keepachangelog.com/en/1.1.0/" target="_blank" rel="noopener">Keep a Changelog</a> &nbsp;|&nbsp;
    Versioning: <a href="https://semver.org/spec/v2.0.0.html" target="_blank" rel="noopener">Semantic Versioning</a></p>`;

  if (state.releases.length === 0) {
    html += `<h2>[Unreleased]</h2>`;
  } else {
    state.releases.forEach(rel => {
      const yanked  = rel.type === 'yanked' ? `<span class="yanked-label">Yanked</span>` : '';
      const pre     = rel.type === 'pre' ? '-pre' : '';
      const verText = repo
        ? `<a href="${esc(repo)}/releases/tag/v${esc(rel.version)}" target="_blank" rel="noopener">${esc(rel.version)}${pre}</a>`
        : `${esc(rel.version)}${pre}`;
      html += `<h2>[${verText}] – ${esc(rel.date)} ${yanked}</h2>`;

      if (rel.entries.length === 0) {
        html += `<p><em>No changes documented.</em></p>`;
        return;
      }

      const grouped = groupEntries(rel.entries);
      Object.entries(grouped).forEach(([type, entries]) => {
        const cfg = TYPE_CONFIG[type] || { emoji: '•' };
        html += `<h3>${cfg.emoji} ${esc(type)}</h3><ul>`;
        entries.forEach(e => {
          const hashPart = e.hash
            ? (repo
                ? ` (<a href="${esc(repo)}/commit/${esc(e.hash)}" target="_blank" rel="noopener"><code>${esc(e.hash)}</code></a>)`
                : ` (<code>${esc(e.hash)}</code>)`)
            : '';
          html += `<li>${esc(e.desc)}${hashPart}</li>`;
        });
        html += `</ul>`;
      });
    });
  }

  $('previewBody').innerHTML = html;
}

/* ── Render Raw ── */
function renderRaw() {
  $('rawOutput').textContent = generateMarkdown();
}

/* ── Render All ── */
function renderOutput() {
  renderPreview();
  renderRaw();
}
function renderAll() {
  renderReleases();
  renderOutput();
}

/* ── Copy Markdown ── */
$('btnCopy').addEventListener('click', () => {
  navigator.clipboard.writeText(generateMarkdown())
    .then(() => toast('Copied to clipboard!'))
    .catch(() => toast('Copy failed — use the Raw tab.', 'error'));
});

/* ── Download ── */
$('btnDownload').addEventListener('click', () => {
  const md   = generateMarkdown();
  const blob = new Blob([md], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'CHANGELOG.md';
  a.click();
  URL.revokeObjectURL(url);
  toast('CHANGELOG.md downloaded!');
});

/* ── Clear All ── */
$('btnClear').addEventListener('click', () => {
  if (!confirm('Clear everything and start fresh?')) return;
  state = { projectName: '', repoUrl: '', releases: [] };
  save();
  $('projectName').value = '';
  $('repoUrl').value     = '';
  updateReleaseSelects();
  renderAll();
  toast('Cleared.');
});

/* ── Seed Demo ── */
function seedDemo() {
  if (state.releases.length > 0) return;
  state.projectName = 'my-awesome-app';
  state.repoUrl     = 'https://github.com/user/my-awesome-app';
  state.releases = [
    {
      id: uid(), version: '2.1.0', date: '2025-04-20', type: 'stable',
      entries: [
        { id: uid(), type: 'Added',   desc: 'Dark mode support across all pages',   hash: 'a1b2c3d' },
        { id: uid(), type: 'Added',   desc: 'Export data as CSV or JSON',            hash: 'e4f5g6h' },
        { id: uid(), type: 'Fixed',   desc: 'Login redirect loop on Safari',         hash: 'i7j8k9l' },
        { id: uid(), type: 'Changed', desc: 'Improved dashboard load time by 40%',  hash: 'm0n1o2p' },
      ],
    },
    {
      id: uid(), version: '2.0.0', date: '2025-03-01', type: 'stable',
      entries: [
        { id: uid(), type: 'Added',   desc: 'Complete UI redesign with new design system', hash: 'q3r4s5t' },
        { id: uid(), type: 'Added',   desc: 'Real-time collaboration features',            hash: 'u6v7w8x' },
        { id: uid(), type: 'Removed', desc: 'Legacy v1 API endpoints (deprecated in 1.8)', hash: 'y9z0a1b' },
        { id: uid(), type: 'Security','desc': 'Upgraded authentication to OAuth 2.1',      hash: 'c2d3e4f' },
      ],
    },
    {
      id: uid(), version: '1.9.2', date: '2025-01-15', type: 'stable',
      entries: [
        { id: uid(), type: 'Fixed', desc: 'Memory leak in the notification service',    hash: 'g5h6i7j' },
        { id: uid(), type: 'Fixed', desc: 'Incorrect date formatting in export reports', hash: 'k8l9m0n' },
      ],
    },
    {
      id: uid(), version: '1.9.1', date: '2024-12-10', type: 'yanked',
      entries: [
        { id: uid(), type: 'Fixed', desc: 'Critical crash on Windows — yanked due to regression', hash: 'o1p2q3r' },
      ],
    },
  ];
  save();
}

/* ── Init ── */
load();
seedDemo();
$('projectName').value = state.projectName;
$('repoUrl').value     = state.repoUrl;
updateReleaseSelects();
renderAll();
