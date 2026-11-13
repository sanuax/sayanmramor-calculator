// scripts/stamp_assets.js -- every script of the configurator's own that its page loads carries
// ?v=<the first 8 hex of the file's sha256>, so a browser that keeps its copy past GitHub Pages' ten minutes
// still fetches a file once it has changed. Run after editing any script the page loads:
//   node scripts/stamp_assets.js
// tests/asset-stamps.test.js fails while a stamp is stale.
//
// Why (2026-11-14): after the step order of «Ступени» changed, a page opened right after the publication ran
// the new html with the old step-engine.js from the browser's cache -- seven steps, one of them with no section.
// The same stamping is done for the site's pages by D:\sayanmramor-site\scripts\stamp_assets.js; the files of
// the site that this page loads (/sayanmramor-site/js/..., /css/...) are stamped there, not here.
//
// The 3D modules (visualizer/*.js written as ES modules) import each other by plain relative URLs
// (three-scene.js -> ./ar-view.js), so a stamp on the page's own script tag does not reach them: the page
// carries an import map (between the IMPORTMAP markers) that sends every module's plain URL to its stamped one.
// It is written before the first module script, where it must stand to count. The third-party files
// (vendor/three/...) are not stamped: they do not change with the configurator.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const PAGE = 'sayanmramor-calculator.html';
// <script src="x.js">, <script type="module" src="visualizer/y.js">: the page's own files only
// (a path with no leading slash and no scheme).
const ASSET = /(<script(?:\s+type="module")?\s+src=")((?!\/|https?:)[\w./-]+\.js)(?:\?v=[0-9a-f]+)?"/g;
const IMPORTMAP = /(<!-- IMPORTMAP -->\n)[^]*?(\n<!-- \/IMPORTMAP -->)/;

// The repository keeps LF and a Windows checkout writes CRLF: the stamp is of the LF text, so it is the same on both.
const hashOf = text => crypto.createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex').slice(0, 8);
const stampOf = file => hashOf(fs.readFileSync(path.join(root, file), 'utf8'));
// The 3D modules: every file in visualizer/ written as an ES module.
const modules = () => fs.readdirSync(path.join(root, 'visualizer')).filter(f => f.endsWith('.js'))
  .map(f => 'visualizer/' + f).filter(f => /^(?:import|export) /m.test(fs.readFileSync(path.join(root, f), 'utf8'))).sort();
const importMapBlock = () => '<!-- IMPORTMAP -->\n<script type="importmap">' + JSON.stringify({
  imports: Object.fromEntries(modules().map(f => ['./' + f, './' + f + '?v=' + stampOf(f)])),
}) + '</script>\n<!-- /IMPORTMAP -->\n';

// html: the page as LF text -> the page with every stamp and the import map current.
function stamped(html) {
  let out = html.replace(ASSET, (m, head, file) => head + file + '?v=' + stampOf(file) + '"');
  if (IMPORTMAP.test(out)) {
    out = out.replace(IMPORTMAP, (m, open, close) => open + importMapBlock().split('\n').slice(1, 2).join('\n') + close);
  } else {
    const at = out.indexOf('<script type="module"');
    if (at < 0) throw new Error('no module script to put the import map before');
    out = out.slice(0, at) + importMapBlock() + out.slice(at);
  }
  return out;
}

if (require.main === module) {
  const file = path.join(root, PAGE);
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  const next = stamped(raw.replace(/\r\n/g, '\n'));
  if (next !== raw.replace(/\r\n/g, '\n')) {
    fs.writeFileSync(file, crlf ? next.replace(/\n/g, '\r\n') : next);
    console.log('stamped', PAGE);
  } else {
    console.log('up to date', PAGE);
  }
}

module.exports = { PAGE, ASSET, hashOf, stampOf, modules, importMapBlock, stamped };
