#!/usr/bin/env node
// build-workflows.js — Patches workflow JSONs with corrected Code node scripts
// Usage: node scripts/build-workflows.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOWS = path.join(ROOT, 'workflows');
const NODES = path.join(__dirname, 'nodes');

// Map: workflow file -> [ { nodeId, jsFile } ]
const codePatches = {
  'main-router.json': [
    { nodeId: '5de7e200-d401-4e1d-b3e7-dd9be16d83b7', jsFile: 'router-main.js' }
  ],
  'daily-briefing.json': [
    { nodeId: 'select_utfpr_course_daily', jsFile: 'select-utfpr-course.js' },
    { nodeId: 'parse_aulas_daily', jsFile: 'parse-aulas-data.js' },
    { nodeId: '622bea1d-2427-4750-a828-65928690534c', jsFile: 'format-all.js' }
  ],
  'calendar-sync.json': [
    { nodeId: 'format_calendar', jsFile: 'format-calendar.js' }
  ],
  'aulas-sync.json': [
    { nodeId: 'select_utfpr_course', jsFile: 'select-utfpr-course.js' },
    { nodeId: 'parse_aulas_data', jsFile: 'parse-aulas-data.js' },
    { nodeId: 'format_aulas', jsFile: 'format-aulas.js' }
  ],
  'moodle-sync.json': [
    { nodeId: 'format_moodle', jsFile: 'format-moodle.js' }
  ],
  'classroom-sync.json': [
    { nodeId: 'parse_courses', jsFile: 'parse-classroom-courses.js' },
    { nodeId: 'format_classroom', jsFile: 'format-classroom.js' }
  ],
  'general-qa.json': [
    { nodeId: 'parse_qa', jsFile: 'parse-qa.js' }
  ]
};

// Map: workflow file -> [ { nodeId, parameter, value } ]
const parameterPatches = {
  'main-router.json': [
    {
      nodeId: 'e3c14a18-10dc-4bd9-a21e-6175c9bd83be',
      parameter: 'workflowId',
      value: '={{ $json.workflowId }}'
    }
  ]
};

const workflowFiles = new Set([
  ...Object.keys(codePatches),
  ...Object.keys(parameterPatches)
]);

function enforceTelegramDefaults(wf) {
  let changed = false;

  wf.nodes.forEach(node => {
    if (node.type !== 'n8n-nodes-base.telegram') return;

    if (!node.parameters) node.parameters = {};
    if (!node.parameters.additionalFields) node.parameters.additionalFields = {};

    if (node.parameters.additionalFields.parse_mode !== 'Markdown') {
      node.parameters.additionalFields.parse_mode = 'Markdown';
      changed = true;
    }

    if (node.parameters.additionalFields.appendAttribution !== false) {
      node.parameters.additionalFields.appendAttribution = false;
      changed = true;
    }
  });

  return changed;
}

let errors = 0;

for (const wfFile of workflowFiles) {
  const nodePatches = codePatches[wfFile] || [];
  const paramPatches = parameterPatches[wfFile] || [];
  const wfPath = path.join(WORKFLOWS, wfFile);
  if (!fs.existsSync(wfPath)) {
    console.error(`[SKIP] ${wfFile} not found`);
    errors++;
    continue;
  }

  const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  let changed = false;

  for (const { nodeId, jsFile } of nodePatches) {
    const jsPath = path.join(NODES, jsFile);
    if (!fs.existsSync(jsPath)) {
      console.error(`[SKIP] ${jsFile} not found`);
      errors++;
      continue;
    }

    const jsCode = fs.readFileSync(jsPath, 'utf8').trim();
    const node = wf.nodes.find(n => n.id === nodeId);
    if (!node) {
      console.error(`[SKIP] Node ${nodeId} not found in ${wfFile}`);
      errors++;
      continue;
    }

    if (!node.parameters) node.parameters = {};
    node.parameters.jsCode = jsCode;
    changed = true;
    console.log(`[OK] ${wfFile} -> ${node.name} (${nodeId}) patched with ${jsFile}`);
  }

  for (const { nodeId, parameter, value } of paramPatches) {
    const node = wf.nodes.find(n => n.id === nodeId);
    if (!node) {
      console.error(`[SKIP] Node ${nodeId} not found in ${wfFile}`);
      errors++;
      continue;
    }

    if (!node.parameters) node.parameters = {};
    node.parameters[parameter] = value;
    changed = true;
    console.log(`[OK] ${wfFile} -> ${node.name} (${nodeId}) parameter ${parameter} updated`);
  }

  if (enforceTelegramDefaults(wf)) {
    changed = true;
    console.log(`[OK] ${wfFile} -> Telegram defaults enforced (Markdown + no attribution)`);
  }

  if (changed) {
    fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + '\n', 'utf8');
    console.log(`[SAVED] ${wfFile}`);
  } else {
    console.log(`[UNCHANGED] ${wfFile}`);
  }
}

if (errors > 0) {
  console.error(`\n${errors} error(s) encountered.`);
  process.exit(1);
} else {
  console.log('\nAll workflows patched successfully.');
}
