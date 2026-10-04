const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'backend', 'scripts');
const toDelete = ['diag-docx.mjs','diag2.mjs','diag3.mjs','diag4.mjs','diag5.mjs','test-render.mjs','db-check.cjs','dbg-login.cjs','test-pernyataan-out.docx'];
for (const f of toDelete) {
  const p = path.join(dir, f);
  try { fs.unlinkSync(p); console.log('deleted', f); } catch { console.log('skip', f); }
}
console.log(fs.readdirSync(dir).join(', '));