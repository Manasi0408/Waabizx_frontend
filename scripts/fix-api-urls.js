const fs = require('fs');
const path = require('path');

function walk(dir, acc = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(js|jsx)$/.test(f)) acc.push(p);
  }
  return acc;
}

function relImport(fromFile) {
  const fromDir = path.dirname(fromFile);
  let rel = path.relative(fromDir, path.join('src', 'utils', 'apiBase')).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return `import { getApiUrl, getApiOrigin } from '${rel}';`;
}

const root = path.join(__dirname, '..', 'src');
for (const file of walk(root)) {
  if (file.includes('apiBase.js')) continue;
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes('api.waabizx.com')) continue;
  const orig = s;

  s = s.replace(
    /\/\/ const API_URL = 'https:\/\/wabizx\.techwhizzc\.com\/api';\nconst API_URL = 'https:\/\/api\.waabizx\.com\/api';/g,
    'const API_URL = getApiUrl();'
  );
  s = s.replace(/const API_URL = 'https:\/\/api\.waabizx\.com\/api';/g, 'const API_URL = getApiUrl();');
  s = s.replace(/const API = "https:\/\/api\.waabizx\.com\/api\/chat";/g, 'const API = `${getApiUrl()}/chat`;');
  s = s.replace(/const API_BASE = "https:\/\/api\.waabizx\.com\/api";/g, 'const API_BASE = getApiUrl();');
  s = s.replace(
    /const BASE_URL = "https:\/\/api\.waabizx\.com\/api\/agent\/chat";/g,
    'const BASE_URL = `${getApiUrl()}/agent/chat`;'
  );
  s = s.replace(/const API_URL = 'https:\/\/api\.waabizx\.com';\n/g, 'const API_URL = getApiOrigin();\n');
  s = s.replace(
    /const API_BASE = \(process\.env\.REACT_APP_API_URL \|\| 'https:\/\/api\.waabizx\.com'\)\.replace\(\/\\\/\$\/, ''\);/g,
    'const API_BASE = getApiOrigin();'
  );
  s = s.replace(
    /String\(process\.env\.REACT_APP_API_URL \|\| "https:\/\/api\.waabizx\.com\/api"\)/g,
    'getApiUrl()'
  );
  s = s.replace(/\|\| "https:\/\/api\.waabizx\.com"/g, '');
  s = s.replace(/\|\| 'https:\/\/api\.waabizx\.com'/g, '');
  s = s.replace(/return "https:\/\/api\.waabizx\.com";/g, 'return getApiOrigin();');
  s = s.replace(/base = 'https:\/\/api\.waabizx\.com';/g, 'base = getApiOrigin();');
  s = s.replace(/apiBase = 'https:\/\/api\.waabizx\.com\/';/g, "apiBase = `${getApiOrigin()}/`;");
  s = s.replace(
    /export const INBOX_API_BASE = 'https:\/\/api\.waabizx\.com\/';/g,
    "export const INBOX_API_BASE = `${getApiOrigin()}/`;"
  );
  s = s.replace(/const API_BASE = 'https:\/\/api\.waabizx\.com\/';/g, "const API_BASE = `${getApiOrigin()}/`;");
  s = s.replace(/if \(u\.startsWith\("\/"\)\) return `https:\/\/api\.waabizx\.com\/\{u\}`;/g, 'if (u.startsWith("/")) return `${getApiOrigin()}${u}`;');

  if (s === orig) continue;

  if (!s.includes('apiBase')) {
    const imp = relImport(path.relative(root, file));
    const lines = s.split('\n');
    let insert = 0;
    while (insert < lines.length && lines[insert].startsWith('import ')) insert += 1;
    lines.splice(insert, 0, imp);
    s = lines.join('\n');
  }

  fs.writeFileSync(file, s);
  console.log('updated', path.relative(root, file));
}
