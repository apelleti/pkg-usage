import type { AnalysisResult } from '../model/types.js';

export function toHtml(result: AnalysisResult): string {
  const dataJson = JSON.stringify(result);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Usage Report: ${esc(result.meta.target)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f7fa;color:#1a1a2e;line-height:1.6;padding:2rem}
.container{max-width:1200px;margin:0 auto}
h1{font-size:1.8rem;margin-bottom:.5rem}
.meta{color:#666;font-size:.9rem;margin-bottom:2rem}
.summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem}
.card{background:#fff;border-radius:12px;padding:1.5rem;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.card h3{font-size:.85rem;text-transform:uppercase;color:#888;margin-bottom:.5rem;letter-spacing:.05em}
.card .value{font-size:2rem;font-weight:700}
.card .value.used{color:#22c55e}
.card .value.unused{color:#ef4444}
.chart-container{display:flex;justify-content:center;margin-bottom:2rem}
svg.donut{width:200px;height:200px}
.donut-label{font-size:1.5rem;font-weight:700;fill:#1a1a2e}
.donut-sublabel{font-size:.75rem;fill:#888}
.controls{display:flex;flex-wrap:wrap;gap:.75rem;margin-bottom:1.5rem;align-items:center}
.controls input,.controls select{padding:.5rem .75rem;border:1px solid #ddd;border-radius:8px;font-size:.9rem;background:#fff}
.controls input{flex:1;min-width:200px}
.ep-section{margin-bottom:2rem}
.ep-header{font-size:1.2rem;font-weight:600;margin-bottom:1rem;padding:.75rem 1rem;background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:1rem}
th{background:#f0f2f5;text-align:left;padding:.75rem 1rem;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:#666;cursor:pointer;user-select:none}
th:hover{background:#e4e7ec}
td{padding:.75rem 1rem;border-top:1px solid #f0f2f5;font-size:.9rem}
tr.used td:first-child{border-left:3px solid #22c55e}
tr.unused td:first-child{border-left:3px solid #ef4444}
tr:hover{background:#f8f9fb}
.badge{display:inline-block;padding:.15rem .5rem;border-radius:4px;font-size:.75rem;font-weight:500}
.badge-used{background:#dcfce7;color:#166534}
.badge-unused{background:#fee2e2;color:#991b1b}
.expandable{cursor:pointer}
.expandable:hover{background:#f0f4ff}
.details{display:none;padding:.5rem 1rem;background:#f8fafc;font-size:.85rem}
.details.open{display:table-row}
.details td{padding:.5rem 1rem;color:#555}
.file-list{margin:0;padding-left:1.5rem}
.file-list li{margin-bottom:.25rem}
.actions{display:flex;gap:.5rem;margin-bottom:2rem}
.btn{padding:.5rem 1rem;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:.85rem}
.btn:hover{background:#f0f2f5}
.hidden{display:none}
</style>
</head>
<body>
<div class="container">
<h1>Usage Report: ${esc(result.meta.target)}</h1>
<p class="meta">Analyzed on ${result.meta.analyzedAt.split('T')[0]} &bull; ${result.meta.projectFiles} files scanned &bull; ${(result.meta.duration / 1000).toFixed(1)}s</p>

<div class="summary-grid">
  <div class="card"><h3>Packages</h3><div class="value">${result.summary.totalPackages}</div></div>
  <div class="card"><h3>Total Exports</h3><div class="value">${result.summary.totalExports}</div></div>
  <div class="card"><h3>Used</h3><div class="value used">${result.summary.totalUsed} (${pct(result.summary.usageRatio)})</div></div>
  <div class="card"><h3>Unused</h3><div class="value unused">${result.summary.totalUnused} (${pct(1 - result.summary.usageRatio)})</div></div>
</div>

<div class="chart-container">
  ${renderDonut(result.summary.totalUsed, result.summary.totalUnused)}
</div>

<div class="controls">
  <input type="text" id="search" placeholder="Search symbols..." oninput="filterAll()">
  <select id="filterKind" onchange="filterAll()"><option value="">All kinds</option>${kindOptions(result)}</select>
  <select id="filterStatus" onchange="filterAll()"><option value="">All</option><option value="used">Used only</option><option value="unused">Unused only</option></select>
</div>

<div class="actions">
  <button class="btn" onclick="downloadJson()">Export JSON</button>
</div>

<div id="content">
${renderEntryPoints(result)}
</div>
</div>

<script type="application/json" id="report-data">${dataJson}</script>
<script>
function filterAll(){
  const q=document.getElementById('search').value.toLowerCase();
  const kind=document.getElementById('filterKind').value;
  const status=document.getElementById('filterStatus').value;
  document.querySelectorAll('tr[data-symbol]').forEach(r=>{
    const n=r.dataset.symbol.toLowerCase();
    const k=r.dataset.kind;
    const s=r.dataset.status;
    let show=true;
    if(q&&!n.includes(q))show=false;
    if(kind&&k!==kind)show=false;
    if(status&&s!==status)show=false;
    r.style.display=show?'':'none';
    const det=document.getElementById('det-'+r.dataset.id);
    if(det&&!show)det.style.display='none';
  });
}
function toggleDetails(id){
  const el=document.getElementById('det-'+id);
  if(el)el.style.display=el.style.display==='table-row'?'none':'table-row';
}
function sortTable(th){
  const table=th.closest('table');
  const idx=Array.from(th.parentNode.children).indexOf(th);
  const tbody=table.querySelector('tbody');
  const rows=Array.from(tbody.querySelectorAll('tr[data-symbol]'));
  const dir=th.dataset.dir==='asc'?'desc':'asc';
  th.dataset.dir=dir;
  rows.sort((a,b)=>{
    let av=a.children[idx]?.textContent??'';
    let bv=b.children[idx]?.textContent??'';
    const an=parseFloat(av),bn=parseFloat(bv);
    if(!isNaN(an)&&!isNaN(bn))return dir==='asc'?an-bn:bn-an;
    return dir==='asc'?av.localeCompare(bv):bv.localeCompare(av);
  });
  rows.forEach(r=>{
    const det=document.getElementById('det-'+r.dataset.id);
    tbody.appendChild(r);
    if(det)tbody.appendChild(det);
  });
}
function downloadJson(){
  const data=document.getElementById('report-data').textContent;
  const blob=new Blob([data],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='usage-report.json';
  a.click();
}
</script>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function renderDonut(used: number, unused: number): string {
  const total = used + unused;
  if (total === 0) return '';
  const ratio = used / total;
  const circumference = 2 * Math.PI * 70;
  const usedArc = circumference * ratio;
  const unusedArc = circumference - usedArc;

  return `<svg class="donut" viewBox="0 0 200 200">
    <circle cx="100" cy="100" r="70" fill="none" stroke="#fee2e2" stroke-width="20"/>
    <circle cx="100" cy="100" r="70" fill="none" stroke="#22c55e" stroke-width="20"
      stroke-dasharray="${usedArc} ${unusedArc}"
      stroke-dashoffset="${circumference * 0.25}"
      stroke-linecap="round"/>
    <text x="100" y="95" text-anchor="middle" class="donut-label">${pct(ratio)}</text>
    <text x="100" y="115" text-anchor="middle" class="donut-sublabel">${used}/${total} used</text>
  </svg>`;
}

function kindOptions(result: AnalysisResult): string {
  const kinds = new Set<string>();
  for (const pkg of result.packages) {
    for (const ep of pkg.entryPoints) {
      for (const s of ep.symbols) {
        kinds.add(s.kind);
      }
    }
  }
  return [...kinds].sort().map((k) => `<option value="${k}">${k}</option>`).join('');
}

function renderEntryPoints(result: AnalysisResult): string {
  let html = '';
  let symbolId = 0;

  for (const pkg of result.packages) {
    for (const ep of pkg.entryPoints) {
      const usedCount = ep.symbols.filter((s) => s.used).length;
      const total = ep.symbols.length;
      const ratio = total > 0 ? usedCount / total : 0;

      html += `<div class="ep-section">
<div class="ep-header">${esc(ep.path)} &mdash; ${usedCount}/${total} used (${pct(ratio)})</div>
<table>
<thead><tr>
  <th onclick="sortTable(this)">Symbol</th>
  <th onclick="sortTable(this)">Kind</th>
  <th onclick="sortTable(this)">Status</th>
  <th onclick="sortTable(this)">Refs</th>
  <th onclick="sortTable(this)">Files</th>
</tr></thead>
<tbody>`;

      for (const s of ep.symbols) {
        const id = `s${symbolId++}`;
        const status = s.used ? 'used' : 'unused';
        const badgeClass = s.used ? 'badge-used' : 'badge-unused';
        const refs = s.usage?.referenceCount ?? 0;
        const files = s.usage?.importedIn.length ?? 0;

        html += `<tr class="${status} expandable" data-symbol="${esc(s.name)}" data-kind="${s.kind}" data-status="${status}" data-id="${id}" onclick="toggleDetails('${id}')">
  <td><strong>${esc(s.name)}</strong></td>
  <td>${s.kind}</td>
  <td><span class="badge ${badgeClass}">${status}</span></td>
  <td>${refs}</td>
  <td>${files}</td>
</tr>`;

        if (s.usage && s.usage.importedIn.length > 0) {
          html += `<tr id="det-${id}" class="details"><td colspan="5"><ul class="file-list">`;
          for (const loc of s.usage.importedIn) {
            html += `<li>${esc(loc.filePath)}:${loc.line}</li>`;
          }
          html += `</ul></td></tr>`;
        }
      }

      html += `</tbody></table></div>`;
    }
  }

  return html;
}
