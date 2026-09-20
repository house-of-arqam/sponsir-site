#!/usr/bin/env node

// Every local href/src in docs/ must resolve to a file that exists. Broken
// asset paths on a static site are invisible until a page 404s in production.

const fs = require('fs');
const path = require('path');

const docsDir = path.resolve(__dirname, '..', 'docs');
const attributePattern = /(?:href|src)\s*=\s*"([^"]+)"/gi;
const errors = [];
let checked = 0;

const isExternal = value =>
  /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value) || value.startsWith('#') || value.startsWith('data:');

for (const file of fs.readdirSync(docsDir).filter(name => name.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(docsDir, file), 'utf8');
  for (const [, value] of html.matchAll(attributePattern)) {
    if (isExternal(value)) continue;
    const target = value.split(/[?#]/)[0];
    if (target === '') continue;
    checked += 1;
    const resolved = target.startsWith('/')
      ? path.join(docsDir, target.slice(1))
      : path.join(docsDir, target);
    if (!fs.existsSync(resolved)) {
      errors.push(`${file}: ${value} -> missing ${path.relative(docsDir, resolved)}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Broken local references:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Link check passed (${checked} local references).`);
