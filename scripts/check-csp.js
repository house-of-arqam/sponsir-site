#!/usr/bin/env node

// GitHub Pages cannot set response headers, so the CSP only exists as a <meta>
// tag on each page. Deleting one is a silent security regression, hence this
// guard.

const fs = require('fs');
const path = require('path');

const docsDir = path.resolve(__dirname, '..', 'docs');
// script-src is deliberately absent on the script-free pages; default-src
// 'none' already covers them.
const requiredDirectives = ['default-src', 'base-uri', 'form-action'];
const errors = [];

for (const file of fs.readdirSync(docsDir).filter(name => name.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(docsDir, file), 'utf8');
  const match = html.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i
  );
  if (!match) {
    errors.push(`${file}: no Content-Security-Policy meta tag`);
    continue;
  }
  for (const directive of requiredDirectives) {
    if (!match[1].includes(`${directive} `)) {
      errors.push(`${file}: CSP is missing the ${directive} directive`);
    }
  }
}

if (errors.length > 0) {
  console.error('CSP check failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('CSP check passed.');
