'use strict';

/* global api */

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const state = {
  filePath: null,
  filename: null,
  format: null,
  fileSize: 0,
  markdown: '',
  json: '',
  activeTab: 'markdown'
};

const FORMAT_LABELS = {
  doc: 'Word (.doc)',
  docx: 'Word (.docx)',
  odt: 'OpenDocument (.odt)',
  pdf: 'PDF',
  ppt: 'PowerPoint (.ppt)',
  pptx: 'PowerPoint (.pptx)',
  rtf: 'RTF',
  epub: 'EPUB',
  xlsx: 'Excel (.xlsx)',
  ods: 'OpenDocument (.ods)',
  odp: 'OpenDocument (.odp)',
  csv: 'CSV'
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

function formatLabel(format) {
  return (format && FORMAT_LABELS[format]) || (format ? String(format).toUpperCase() : 'Desconocido');
}

function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

function showStatus(text, kind) {
  const el = $('#status');
  el.innerHTML = text;
  el.className = 'status ' + (kind || 'info');
  el.classList.remove('hidden');
}

function hideStatus() {
  $('#status').classList.add('hidden');
}

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2600);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Render de Markdown (vista previa)
// ---------------------------------------------------------------------------
function renderInline(text) {
  const codeSpans = [];
  let t = String(text).replace(/`([^`\n]+)`/g, (_m, c) => {
    codeSpans.push(escapeHtml(c));
    return '\u0000' + (codeSpans.length - 1) + '\u0000';
  });
  t = escapeHtml(t);

  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt, url) =>
    '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt) + '" />');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, txt, url) =>
    '<a href="' + escapeHtml(url) + '">' + txt + '</a>');

  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  t = t.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
  t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  t = t.replace(/\u0000(\d+)\u0000/g, (_m, idx) => '<code>' + codeSpans[Number(idx)] + '</code>');
  return t;
}

function renderTable(lines) {
  const parseRow = (line) =>
    line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const header = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  const max = Math.max(header.length, ...rows.map((r) => r.length));
  let html = '<table><thead><tr>' + header.map((c) => '<th>' + renderInline(c) + '</th>').join('') +
    Array(Math.max(0, max - header.length)).fill('<th></th>').join('') + '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>' + row.map((c) => '<td>' + renderInline(c) + '</td>').join('') +
      Array(Math.max(0, max - row.length)).fill('<td></td>').join('') + '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function renderMarkdown(src) {
  if (src == null || src === '') return '<p class="empty">Sin contenido.</p>';
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isHr = (l) => /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l);
  const isFence = (l) => /^\s{0,3}(```|~~~)/.test(l);
  const isTableSep = (l) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.indexOf('-') !== -1;
  const isBullet = (l) => /^\s{0,3}[-*+]\s+/.test(l);
  const isOrdered = (l) => /^\s{0,3}\d+[.)]\s+/.test(l);

  const flush = (buf) => {
    if (!buf.length) return;
    out.push('<p>' + renderInline(buf.join('\n')) + '</p>');
    buf.length = 0;
  };

  const parseList = (start, ordered) => {
    const items = [];
    let j = start;
    while (j < lines.length) {
      const line = lines[j];
      const m = ordered ? /^\s{0,3}\d+[.)]\s+(.*)$/.exec(line) : /^\s{0,3}[-*+]\s+(.*)$/.exec(line);
      if (!m) break;
      const content = [m[1]];
      j++;
      // Continuación del elemento: líneas indentadas o en blanco seguidas de indentación.
      while (j < lines.length) {
        const nl = lines[j];
        if (nl.trim() === '') {
          j++;
          let k = j;
          while (k < lines.length && lines[k].trim() === '') k++;
          if (k < lines.length && /^\s{2,}/.test(lines[k])) {
            content.push('', lines[k]);
            j = k + 1;
            continue;
          }
          break;
        }
        if (isBullet(nl) || isOrdered(nl)) break;
        if (isFence(nl)) break;
        content.push(nl.replace(/^\s{1,4}/, ''));
        j++;
      }
      items.push('<li>' + renderMarkdown(content.join('\n').replace(/^<p class="empty">.*?<\/p>$/, '') || content.join('\n')) + '</li>');
    }
    return { html: '<' + (ordered ? 'ol' : 'ul') + '>' + items.join('') + '</' + (ordered ? 'ol' : 'ul') + '>', next: j };
  };

  let para = [];
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { flush(para); i++; continue; }

    // Código cercado
    if (isFence(line)) {
      flush(para);
      const marker = line.trim().slice(0, 3);
      const lang = line.trim().slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) { code.push(lines[i]); i++; }
      i++; // cierre
      out.push('<pre><code' + (lang ? ' class="language-' + escapeHtml(lang) + '"' : '') + '>' + escapeHtml(code.join('\n')) + '</code></pre>');
      continue;
    }

    // Encabezados
    const h = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush(para);
      const level = h[1].length;
      out.push('<h' + level + '>' + renderInline(h[2]) + '</h' + level + '>');
      i++;
      continue;
    }

    // Regla horizontal
    if (isHr(line)) { flush(para); out.push('<hr />'); i++; continue; }

    // Cita
    if (/^\s{0,3}>/.test(line)) {
      flush(para);
      const q = [];
      while (i < lines.length && (/^\s{0,3}>/.test(lines[i]) || lines[i].trim() === '')) {
        if (lines[i].trim() === '') { q.push(''); i++; continue; }
        q.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + renderMarkdown(q.join('\n')) + '</blockquote>');
      continue;
    }

    // Tabla
    if (line.indexOf('|') !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush(para);
      const table = [line];
      i++;
      i++; // salto la fila separadora
      while (i < lines.length && lines[i].indexOf('|') !== -1 && lines[i].trim() !== '') { table.push(lines[i]); i++; }
      out.push(renderTable(table));
      continue;
    }

    // Listas
    if (isBullet(line)) { flush(para); const r = parseList(i, false); out.push(r.html); i = r.next; continue; }
    if (isOrdered(line)) { flush(para); const r = parseList(i, true); out.push(r.html); i = r.next; continue; }

    para.push(line);
    i++;
  }
  flush(para);

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Carga y conversión
// ---------------------------------------------------------------------------
async function loadAndConvert(filePath) {
  const settings = await api.loadSettings();
  showStatus('<span class="spinner"></span>Convirtiendo…', 'info');
  try {
    const res = await api.convert(filePath, settings);
    if (!res.ok) {
      showStatus('<strong>Error:</strong> ' + res.message, 'error');
      return;
    }

    state.filePath = filePath;
    state.filename = res.filename;
    state.format = res.format;
    state.fileSize = res.fileSize;
    state.markdown = res.markdown;
    state.json = res.json;

    $('#file-name').textContent = res.filename;
    $('#file-sub').textContent = formatLabel(res.format) + ' · ' + formatBytes(res.fileSize);
    $('#filecard').classList.remove('hidden');
    $('#dropzone').classList.add('hidden');
    $('#output').classList.remove('hidden');
    hideStatus();
    renderOutput();
  } catch (err) {
    showStatus('<strong>Error:</strong> ' + (err && err.message ? err.message : err), 'error');
  }
}

function renderOutput() {
  const preview = $('#chk-preview').checked;
  const mdPreview = $('#md-preview');
  const mdSource = $('#md-source');
  mdPreview.innerHTML = renderMarkdown(state.markdown);
  mdSource.textContent = state.markdown;
  mdPreview.classList.toggle('hidden', !preview);
  mdSource.classList.toggle('hidden', preview);
  $('#json-source').textContent = state.json;
}

function baseName(filename) {
  const base = (filename || 'documento');
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function activeContent() {
  return state.activeTab === 'json' ? state.json : state.markdown;
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------
$('#btn-open').addEventListener('click', async (e) => {
  e.stopPropagation();
  const res = await api.openFile();
  if (!res.canceled && res.filePath) loadAndConvert(res.filePath);
});

$('#dropzone').addEventListener('click', async () => {
  const res = await api.openFile();
  if (!res.canceled && res.filePath) loadAndConvert(res.filePath);
});

$('#dropzone').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#btn-open').click(); }
});

$('#btn-reload').addEventListener('click', async () => {
  const res = await api.openFile();
  if (!res.canceled && res.filePath) loadAndConvert(res.filePath);
});

// Arrastrar y soltar en toda la ventana
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  const dz = $('#dropzone');
  if (dz && !dz.classList.contains('hidden')) dz.classList.add('dragover');
});
document.addEventListener('dragleave', () => {
  $('#dropzone').classList.remove('dragover');
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  $('#dropzone').classList.remove('dragover');
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  let p = null;
  try { p = api.getPathForFile(file); } catch { p = file.path || null; }
  if (p) loadAndConvert(p);
});

// Pestañas
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    state.activeTab = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === state.activeTab));
    $('#md-view-toggle').classList.toggle('hidden', state.activeTab !== 'markdown');
  });
});

// Vista previa / código
$('#chk-preview').addEventListener('change', renderOutput);

// Copiar
$('#btn-copy').addEventListener('click', async () => {
  await api.copyText(activeContent());
  toast('Copiado al portapapeles');
});

// Descargar
$('#btn-save-md').addEventListener('click', async () => {
  const res = await api.saveFile({ defaultName: baseName(state.filename) + '.md', content: state.markdown, isJson: false });
  if (res.canceled) return;
  if (res.error) toast('No se pudo guardar: ' + res.error);
  else toast('Guardado: ' + res.filePath);
});

$('#btn-save-json').addEventListener('click', async () => {
  const res = await api.saveFile({ defaultName: baseName(state.filename) + '.json', content: state.json, isJson: true });
  if (res.canceled) return;
  if (res.error) toast('No se pudo guardar: ' + res.error);
  else toast('Guardado: ' + res.filePath);
});

// Ajustes
async function openSettings() {
  const s = await api.loadSettings();
  $('#chk-ocr').checked = !!s.ocrEnabled;
  $('#input-apikey').value = s.apiKey || '';
  $('#settings-overlay').classList.remove('hidden');
}

$('#btn-settings').addEventListener('click', openSettings);
$('#btn-close-settings').addEventListener('click', () => $('#settings-overlay').classList.add('hidden'));
$('#settings-overlay').addEventListener('click', (e) => {
  if (e.target === $('#settings-overlay')) $('#settings-overlay').classList.add('hidden');
});

$('#btn-save-settings').addEventListener('click', async () => {
  const settings = {
    ocrEnabled: $('#chk-ocr').checked,
    apiKey: $('#input-apikey').value.trim()
  };
  await api.saveSettings(settings);
  $('#settings-overlay').classList.add('hidden');
  toast('Ajustes guardados');
});
