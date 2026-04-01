#!/usr/bin/env node
// lint-workflows.js — Validates workflow JSONs follow formatting standards
// Usage: node scripts/lint-workflows.js
//
// Checks:
//   1. All Code nodes that build Telegram messages must include esc() or sanitizeMd()
//   2. All Telegram send nodes must use parse_mode: "Markdown"
//   3. All Telegram send nodes must set appendAttribution: false
//   4. Dynamic content in message templates must use esc() wrapping
//   5. No unescaped string interpolation in message-building code

const fs = require('fs');
const path = require('path');

const WORKFLOWS = path.join(__dirname, '..', 'workflows');
const files = fs.readdirSync(WORKFLOWS).filter(f => f.endsWith('.json'));

let warnings = 0;
let errors = 0;

function warn(file, node, msg) {
  console.log(`  [WARN] ${file} > "${node}": ${msg}`);
  warnings++;
}

function error(file, node, msg) {
  console.log(`  [ERR]  ${file} > "${node}": ${msg}`);
  errors++;
}

console.log('Linting workflows...\n');

for (const file of files) {
  const wfPath = path.join(WORKFLOWS, file);
  let wf;
  try {
    wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  } catch (e) {
    error(file, '-', `Invalid JSON: ${e.message}`);
    continue;
  }

  console.log(`${file} (${wf.name || 'unnamed'}):`);

  const telegramNodes = wf.nodes.filter(n =>
    n.type === 'n8n-nodes-base.telegram' || n.type === 'n8n-nodes-base.telegramTrigger'
  );
  const codeNodes = wf.nodes.filter(n => n.type === 'n8n-nodes-base.code');

  // Check 1: Telegram nodes must use parse_mode Markdown
  for (const tn of telegramNodes) {
    if (tn.type === 'n8n-nodes-base.telegramTrigger') continue;
    const pm = tn.parameters?.additionalFields?.parse_mode;
    const appendAttribution = tn.parameters?.additionalFields?.appendAttribution;

    if (!pm) {
      error(file, tn.name, 'Missing parse_mode in Telegram node');
    } else if (pm !== 'Markdown') {
      warn(file, tn.name, `parse_mode is "${pm}", expected "Markdown"`);
    }

    if (appendAttribution !== false) {
      error(file, tn.name, 'appendAttribution must be false to avoid n8n footer in Telegram messages');
    }
  }

  // Check 2: Code nodes that build messages must include esc() or sanitizeMd()
  // Heuristic: if the code references 'message' or 'text' with template literals
  for (const cn of codeNodes) {
    const code = cn.parameters?.jsCode || '';

    // Does this node build a Telegram message?
    const buildsMessage = /message\s*\+=|message\s*=\s*[`'"]|\.text\s*[:=]/.test(code)
      && /\$\{/.test(code);

    if (!buildsMessage) continue;

    const hasEsc = /function\s+esc\s*\(/.test(code);
    const hasSanitize = /function\s+sanitizeMd\s*\(/.test(code);

    if (!hasEsc && !hasSanitize) {
      error(file, cn.name, 'Builds Telegram message with interpolation but missing esc()/sanitizeMd() function');
    }

    // Check 3: Look for common unescaped patterns
    // Dynamic API data interpolated without esc(): ev.name, event.summary, work.title, etc.
    const dangerousPatterns = [
      /\$\{[^}]*\.name[^}]*\}/,
      /\$\{[^}]*\.title[^}]*\}/,
      /\$\{[^}]*\.summary[^}]*\}/,
      /\$\{[^}]*\.shortname[^}]*\}/,
      /\$\{[^}]*\.content[^}]*\}/,
    ];
    for (const pat of dangerousPatterns) {
      const match = code.match(pat);
      if (match && !match[0].includes('esc(') && !match[0].includes('sanitize')) {
        warn(file, cn.name, `Potentially unescaped dynamic content: ${match[0]}`);
      }
    }
  }

  // Check 4: Workflow should have error handling on API nodes
  const httpNodes = wf.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');
  for (const hn of httpNodes) {
    if (!hn.onError) {
      warn(file, hn.name, 'HTTP node missing onError handler');
    }
  }

  console.log('');
}

console.log('---');
console.log(`Results: ${errors} error(s), ${warnings} warning(s)`);

if (errors > 0) {
  console.log('\nFix errors before deploying!');
  process.exit(1);
} else if (warnings > 0) {
  console.log('\nWarnings found. Review before deploying.');
  process.exit(0);
} else {
  console.log('\nAll checks passed!');
  process.exit(0);
}
