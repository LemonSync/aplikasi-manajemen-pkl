const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const OUT = path.join(__dirname, '..', 'dist');

// tsc hanya mengeluarkan .js; aset non-TS harus ikut agar __dirname relatif di dist tetap valid.
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const from = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(from);
      continue;
    }
    if (/\.ts$/.test(entry.name)) continue;
    const to = path.join(OUT, path.relative(SRC, from));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
};

if (fs.existsSync(SRC)) walk(SRC);
