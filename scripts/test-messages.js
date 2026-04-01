#!/usr/bin/env node
// =============================================================================
// test-messages.js — Testa formatação de mensagens ANTES de deployar
//
// USO:
//   node scripts/test-messages.js
//
// O QUE FAZ:
//   1. Testa a função esc() com casos extremos (underscores, asteriscos, etc.)
//   2. Testa a função sanitizeMd() para respostas de LLM
//   3. Simula mensagens completas com dados mock de cada fonte (Moodle, Calendar, Classroom)
//   4. Valida que o Markdown gerado é válido para o Telegram (entidades pareadas)
//   5. Testa cenários de dados vazios/nulos
//
// SE ALGUM TESTE FALHAR: mostra exatamente o que deu errado e sai com código 1.
// =============================================================================

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------------
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const NC = '\x1b[0m';

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log(`\n${BOLD}${name}${NC}`);
}

function assert(desc, condition, detail) {
  if (condition) {
    console.log(`  ${GREEN}✔${NC} ${desc}`);
    passed++;
  } else {
    console.log(`  ${RED}✘${NC} ${desc}`);
    if (detail) console.log(`    ${DIM}${detail}${NC}`);
    failed++;
  }
}

function assertEqual(desc, actual, expected) {
  assert(desc, actual === expected, `esperado: ${JSON.stringify(expected)}, recebido: ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------------------
// Funções extraídas dos nodes (mesma lógica que roda no n8n)
// ---------------------------------------------------------------------------
function esc(t) { return String(t).replace(/([_*`\[\]])/g, '\\$1'); }

function sanitizeMd(text) {
  let t = String(text);
  const stars = (t.match(/(?<!\\)\*/g) || []);
  if (stars.length % 2 !== 0) {
    const lastIdx = t.lastIndexOf('*');
    t = t.substring(0, lastIdx) + '\\*' + t.substring(lastIdx + 1);
  }
  const underscores = (t.match(/(?<!\\)_/g) || []);
  if (underscores.length % 2 !== 0) {
    const lastIdx = t.lastIndexOf('_');
    t = t.substring(0, lastIdx) + '\\_' + t.substring(lastIdx + 1);
  }
  const singles = (t.match(/(?<!`)(?<!\\)`(?!`)/g) || []);
  if (singles.length % 2 !== 0) {
    const lastIdx = t.lastIndexOf('`');
    t = t.substring(0, lastIdx) + '\\`' + t.substring(lastIdx + 1);
  }
  t = t.replace(/\[(?![^\]]*\])/g, '\\[');
  return t;
}

// ---------------------------------------------------------------------------
// Validador de Markdown V1 do Telegram
// Verifica que todas as entidades estão propriamente pareadas.
// Retorna { valid: true } ou { valid: false, reason: "..." }
// ---------------------------------------------------------------------------
function validateTelegramMd(text) {
  // Remover sequências escapadas da análise
  const cleaned = text.replace(/\\[_*`\[\]]/g, '');

  // Verificar * pareados
  const stars = (cleaned.match(/\*/g) || []).length;
  if (stars % 2 !== 0) {
    return { valid: false, reason: `${stars} asterisco(s) sem par — Telegram vai rejeitar` };
  }

  // Verificar _ pareados
  const underscores = (cleaned.match(/_/g) || []).length;
  if (underscores % 2 !== 0) {
    return { valid: false, reason: `${underscores} underscore(s) sem par — Telegram vai rejeitar` };
  }

  // Verificar ` pareados (ignorando ```)
  const tripleRemoved = cleaned.replace(/```/g, '');
  const backticks = (tripleRemoved.match(/`/g) || []).length;
  if (backticks % 2 !== 0) {
    return { valid: false, reason: `${backticks} backtick(s) sem par — Telegram vai rejeitar` };
  }

  // Verificar [ sem ]
  const bracketCheck = cleaned.replace(/\[[^\]]*\]/g, ''); // remove pares válidos
  if (bracketCheck.includes('[')) {
    return { valid: false, reason: '[ sem ] correspondente — Telegram vai rejeitar' };
  }

  return { valid: true };
}

function assertValidMd(desc, text) {
  const result = validateTelegramMd(text);
  assert(desc, result.valid, result.reason);
  if (!result.valid) {
    // Mostrar trecho problemático para debug
    const lines = text.split('\n').slice(0, 5).join('\n');
    console.log(`    ${DIM}Primeiras linhas: ${lines}...${NC}`);
  }
}

// =============================================================================
// TESTES
// =============================================================================

console.log(`${BOLD}🧪 Testes de Formatação de Mensagens${NC}`);
console.log('='.repeat(50));

// ---------------------------------------------------------------------------
suite('1. esc() — Escape de caracteres especiais');
// ---------------------------------------------------------------------------
assertEqual('Underscore simples', esc('LISTA_02'), 'LISTA\\_02');
assertEqual('Múltiplos underscores', esc('a_b_c_d'), 'a\\_b\\_c\\_d');
assertEqual('Asterisco em nome', esc('Cálculo *Avançado*'), 'Cálculo \\*Avançado\\*');
assertEqual('Colchetes', esc('[TURMA A] Prova'), '\\[TURMA A\\] Prova');
assertEqual('Backtick em código', esc('Use `print()`'), 'Use \\`print()\\`');
assertEqual('Texto limpo (sem especiais)', esc('Aula de Física'), 'Aula de Física');
assertEqual('String vazia', esc(''), '');
assertEqual('Número convertido', esc(42), '42');
assertEqual('Todos os especiais juntos', esc('_*`[]'), '\\_\\*\\`\\[\\]');
assertEqual('Acentos preservados', esc('Ação_Rápida'), 'Ação\\_Rápida');

// ---------------------------------------------------------------------------
suite('2. sanitizeMd() — Sanitização de respostas LLM');
// ---------------------------------------------------------------------------
assertEqual('Asterisco ímpar', sanitizeMd('hello *world'), 'hello \\*world');
assertEqual('Underscore ímpar', sanitizeMd('LISTA_02'), 'LISTA\\_02');
assertEqual('Backtick ímpar', sanitizeMd('use `code'), 'use \\`code');
assertEqual('Colchete sem par', sanitizeMd('veja [isso'), 'veja \\[isso');
assertEqual('Pares OK mantidos', sanitizeMd('*bold* and _italic_'), '*bold* and _italic_');
assertEqual('Triplo backtick preservado', sanitizeMd('```code```'), '```code```');
assertEqual('Misto complexo', sanitizeMd('*bold* text with LISTA_02 and *'), '*bold* text with LISTA\\_02 and \\*');

// ---------------------------------------------------------------------------
suite('3. Formatação Moodle — dados reais que causaram o bug');
// ---------------------------------------------------------------------------
{
  // Mock dos dados que geraram o erro original
  const mockMoodleEvents = [
    {
      name: 'Consolidação  -  Aula 03 está marcado(a) para esta data',
      timestart: Math.floor(Date.now() / 1000) + 86400,
      course: { shortname: 'PEAENG' }
    },
    {
      name: 'Término de APS 3 - ELT74A - 1 SEMESTRE 2026 - TURMA S01',
      timestart: Math.floor(Date.now() / 1000) + 172800,
      course: { shortname: 'ELT74A' }
    },
    {
      name: 'Término de Exercício de laboratório 2.10',
      timestart: Math.floor(Date.now() / 1000) + 259200,
      course: { shortname: 'Técnicas de Programação' }
    }
  ];

  let msg = '🎓 *Moodle — Proximos Itens*\n\n';
  msg += '*📊 RESUMO*\n';
  msg += `• Total: *${mockMoodleEvents.length}*\n`;
  msg += '• Hoje: *0*\n';
  msg += '• Urgentes (<48h): *2*\n\n';
  msg += '*🗂️ AGENDA*\n';
  mockMoodleEvents.forEach(ev => {
    const course = esc(ev.course.shortname.trim());
    const name = esc(ev.name);
    msg += `• ⚠️ *[${course}]* ${name}\n  📅 TER., 07/04 as 23:59\n\n`;
  });

  assertValidMd('Mensagem Moodle com dados reais', msg);
  assert('Header novo do Moodle', msg.includes('🎓 *Moodle — Proximos Itens*'));
  assert('Seção RESUMO no Moodle', msg.includes('*📊 RESUMO*'));
  assert('Seção AGENDA no Moodle', msg.includes('*🗂️ AGENDA*'));
}

// ---------------------------------------------------------------------------
suite('4. Formatação Classroom — dados com underscore (o bug original)');
// ---------------------------------------------------------------------------
{
  const mockClassroom = [
    { courseName: 'MECÂNICA GERAL - ELB51', title: 'LISTA_02', dueStr: 'QUA., 01/04' },
    { courseName: 'Cálculo *Diferencial*', title: 'Exercício_final_v2', dueStr: 'SEX., 03/04' },
    { courseName: 'Prog[A]', title: 'Trabalho `código` final', dueStr: 'DOM., 05/04' }
  ];

  let msg = '🏫 *Classroom — Proximas Entregas*\n\n';
  msg += '*📊 RESUMO*\n';
  msg += `• Total: *${mockClassroom.length}*\n`;
  msg += '• Hoje: *1*\n';
  msg += '• Urgentes (<48h): *2*\n\n';
  msg += '*🗂️ AGENDA*\n';
  mockClassroom.forEach(w => {
    const cName = esc(w.courseName);
    const wTitle = esc(w.title);
    msg += `• ⚠️ *[${cName}]* ${wTitle}\n  📅 ${w.dueStr} as 23:59\n\n`;
  });

  assertValidMd('Classroom com LISTA_02 (bug original)', msg);
  assert('LISTA_02 escapado no output', msg.includes('LISTA\\_02'), `Não encontrou LISTA\\_02 no output`);
  assert('Asteriscos em nome escapados', msg.includes('\\*Diferencial\\*'), 'Asteriscos não foram escapados');
  assert('Colchetes em nome escapados', msg.includes('Prog\\[A\\]'), 'Colchetes não foram escapados');
  assert('Backticks em título escapados', msg.includes('\\`código\\`'), 'Backticks não foram escapados');
  assert('Header novo do Classroom', msg.includes('🏫 *Classroom — Proximas Entregas*'));
  assert('Seção RESUMO no Classroom', msg.includes('*📊 RESUMO*'));
  assert('Seção AGENDA no Classroom', msg.includes('*🗂️ AGENDA*'));
}

// ---------------------------------------------------------------------------
suite('5. Daily Briefing — timeline unificada por prioridade');
// ---------------------------------------------------------------------------
{
  // Simula o formato atual padronizado
  let message = '📘 *Briefing Integrado — TER., 31/03*\n\n';
  message += '*📊 RESUMO*\n';
  message += '• Total: *8*\n';
  message += '• Hoje: *4*\n';
  message += '• Urgentes (<48h): *3*\n\n';

  // Hoje: mistura calendar + academic, tudo por horário
  message += '*🔥 HOJE*\n';
  message += `• 🔥 *[${esc('AGENDA')}]* ${esc('Exercícios - Cardio')}\n`;
  message += `  📅 TER., 31/03 as 06:00\n\n`;
  message += `• 🔥 *[${esc('PEAENG')}]* ${esc('Consolidação - Aula 03')}\n`;
  message += `  📅 TER., 31/03 as 14:00\n`;

  // Próximos: unified, sorted by date
  message += `\n*🗂️ PROXIMOS DIAS*\n`;
  message += `• ⚠️ *[${esc('MECÂNICA GERAL - ELB51')}]* ${esc('LISTA_02')}\n`;
  message += `  📅 QUA., 01/04 as 23:59\n\n`;
  message += `• ⚠️ *[${esc('ELT74A')}]* ${esc('APS 3 - TURMA S01')}\n`;
  message += `  📅 DOM., 05/04 as 23:59\n\n`;
  message += `• 📌 *[${esc('Técnicas de Programação')}]* ${esc('Exercício_Lab_2.10')}\n`;
  message += `  📅 TER., 07/04 as 23:59\n`;

  assertValidMd('Briefing unificado completo', message);

  assert('Header novo do Briefing', message.includes('📘 *Briefing Integrado —'));
  assert('Seção RESUMO no Briefing', message.includes('*📊 RESUMO*'));
  assert('Seção HOJE no Briefing', message.includes('*🔥 HOJE*'));
  assert('Seção PROXIMOS DIAS no Briefing', message.includes('*🗂️ PROXIMOS DIAS*'));

  // Verificar formato unificado: sem seções por fonte
  assert('Sem seção separada de Moodle', !message.includes('ENTREGAS & PROVAS'), 'Ainda tem header Moodle separado');
  assert('Sem seção separada de Classroom', !message.includes('GOOGLE CLASSROOM'), 'Ainda tem header Classroom separado');
  assert('Sem seção separada de Calendar', !message.includes('EVENTOS PESSOAIS'), 'Ainda tem header Calendar separado');
  assert('LISTA_02 escapado', message.includes('LISTA\\_02'));

  // Verificar tamanho (Telegram limite 4096 bytes)
  const byteLength = Buffer.byteLength(message, 'utf8');
  assert(`Tamanho OK (${byteLength} bytes, limite 4096)`, byteLength <= 4096,
    `Mensagem tem ${byteLength} bytes, excede limite do Telegram`);
}

// ---------------------------------------------------------------------------
suite('6. Cenários de dados vazios');
// ---------------------------------------------------------------------------
{
  // Moodle sem eventos
  const emptyMoodle = [
    '🎓 *Moodle — Proximos Itens*',
    '',
    '*📊 RESUMO*',
    '• Total: *0*',
    '• Hoje: *0*',
    '• Urgentes (<48h): *0*',
    '',
    '*🗂️ AGENDA*',
    '😴 Nenhum item no periodo.'
  ].join('\n');
  assertValidMd('Moodle sem eventos', emptyMoodle);

  // Classroom sem cursos
  const emptyCourses = [
    '🏫 *Classroom — Proximas Entregas*',
    '',
    '*📊 RESUMO*',
    '• Total: *0*',
    '• Hoje: *0*',
    '• Urgentes (<48h): *0*',
    '',
    '*🗂️ AGENDA*',
    '😴 Nenhuma entrega no periodo.'
  ].join('\n');
  assertValidMd('Classroom sem cursos', emptyCourses);

  // Classroom sem entregas
  const emptyWork = [
    '🏫 *Classroom — Proximas Entregas*',
    '',
    '*📊 RESUMO*',
    '• Total: *0*',
    '• Hoje: *0*',
    '• Urgentes (<48h): *0*',
    '',
    '*🗂️ AGENDA*',
    '😴 Nenhuma entrega no periodo.'
  ].join('\n');
  assertValidMd('Classroom sem entregas', emptyWork);

  // Calendario sem eventos
  const emptyCalendar = [
    '🗓️ *Calendario — Proximos 7 dias*',
    '',
    '*📊 RESUMO*',
    '• Total: *0*',
    '• Hoje: *0*',
    '• Proximos dias: *0*',
    '',
    '*🗂️ AGENDA*',
    '😴 Nenhum evento no periodo.'
  ].join('\n');
  assertValidMd('Calendario sem eventos', emptyCalendar);

  // Briefing mínimo (sem eventos de nenhuma fonte)
  let minBriefing = '📘 *Briefing Integrado — TER., 31/03*\n\n';
  minBriefing += '*📊 RESUMO*\n';
  minBriefing += '• Total: *0*\n';
  minBriefing += '• Hoje: *0*\n';
  minBriefing += '• Urgentes (<48h): *0*\n\n';
  minBriefing += '*🔥 HOJE*\n';
  minBriefing += '😴 Nenhum item para hoje.\n';
  minBriefing += '\n*🗂️ PROXIMOS DIAS*\n';
  minBriefing += '😴 Nenhum item nos proximos dias.\n';
  assertValidMd('Briefing sem nenhum evento', minBriefing);
}

// ---------------------------------------------------------------------------
suite('7. Respostas LLM via sanitizeMd()');
// ---------------------------------------------------------------------------
{
  // Resposta normal com Markdown válido
  assertValidMd('LLM com Markdown correto', sanitizeMd('*Resposta:* Use `print()` para debug'));

  // Resposta com Markdown quebrado
  assertValidMd('LLM com * ímpar', sanitizeMd('A resposta é *sim, claro'));
  assertValidMd('LLM com _ ímpar', sanitizeMd('Use variável_nome no código'));
  assertValidMd('LLM com ` ímpar', sanitizeMd('Execute `code no terminal'));
  assertValidMd('LLM com [ sem ]', sanitizeMd('Veja [referência para mais'));

  // Resposta longa com múltiplos problemas
  const messyLlm = `Aqui vai a resposta:

*Passo 1:* Defina a variável_x
Use a fórmula: f(x) = x² + 2*x + 1

\`\`\`python
def solve(x):
    return x**2 + 2*x + 1
\`\`\`

Veja [este link para mais detalhes.

*Nota: não esqueça de testar!`;

  assertValidMd('LLM resposta longa com múltiplos problemas', sanitizeMd(messyLlm));
}

// ---------------------------------------------------------------------------
suite('8. validateTelegramMd() — o próprio validador');
// ---------------------------------------------------------------------------
{
  assert('Markdown válido aceito', validateTelegramMd('*bold* _italic_ `code`').valid);
  assert('* ímpar rejeitado', !validateTelegramMd('*aberto').valid);
  assert('_ ímpar rejeitado', !validateTelegramMd('under_score').valid);
  assert('` ímpar rejeitado', !validateTelegramMd('`code').valid);
  assert('[ sem ] rejeitado', !validateTelegramMd('[aberto').valid);
  assert('Escapados aceitos', validateTelegramMd('\\*ok \\_ok \\`ok \\[ok').valid);
  assert('String vazia aceita', validateTelegramMd('').valid);
  assert('Emojis aceitos', validateTelegramMd('📅 🎓 ⚠️ 📌 🔥 😴 🎉').valid);
}

// ---------------------------------------------------------------------------
suite('9. Consistência entre nodes/*.js e funções locais');
// ---------------------------------------------------------------------------
{
  // Verificar que os arquivos JS dos nodes contêm a função esc()
  const nodesDir = path.join(__dirname, 'nodes');
  const nodeFiles = ['format-all.js', 'format-moodle.js', 'format-classroom.js', 'format-calendar.js', 'format-aulas.js'];

  for (const file of nodeFiles) {
    const filePath = path.join(nodesDir, file);
    if (fs.existsSync(filePath)) {
      const code = fs.readFileSync(filePath, 'utf8');
      assert(`${file} contém esc()`, /function\s+esc\s*\(/.test(code));
      // Verificar que o regex é idêntico ao que testamos
      assert(`${file} usa regex correto`, code.includes("replace(/([_*`\\[\\]])/g"));
    } else {
      assert(`${file} existe`, false, `Arquivo não encontrado: ${filePath}`);
    }
  }

  const qaFile = path.join(nodesDir, 'parse-qa.js');
  if (fs.existsSync(qaFile)) {
    const code = fs.readFileSync(qaFile, 'utf8');
    assert('parse-qa.js contém sanitizeMd()', /function\s+sanitizeMd\s*\(/.test(code));
  }

  const aulasParseFile = path.join(nodesDir, 'parse-aulas-data.js');
  assert('parse-aulas-data.js existe', fs.existsSync(aulasParseFile));

  const aulasSelectFile = path.join(nodesDir, 'select-utfpr-course.js');
  assert('select-utfpr-course.js existe', fs.existsSync(aulasSelectFile));
}

// ---------------------------------------------------------------------------
suite('10. Cobertura de integração (router/build/deploy)');
// ---------------------------------------------------------------------------
{
  const root = path.join(__dirname, '..');

  const routerCode = fs.readFileSync(path.join(root, 'scripts', 'nodes', 'router-main.js'), 'utf8');
  assert('Router reconhece /calendar', /\^\\\/\(calendar\|calendario\)\\b/.test(routerCode));
  assert('Router mapeia calendar-sync', routerCode.includes("'calendar-sync': 'calendarSync2468'"));
  assert('Router reconhece /aulas', /\^\\\/\(aulas\|horario\)\\b/.test(routerCode));
  assert('Router mapeia aulas-sync', routerCode.includes("'aulas-sync': 'aulasSync24680'"));

  const buildCode = fs.readFileSync(path.join(root, 'scripts', 'build-workflows.js'), 'utf8');
  assert('build-workflows inclui calendar-sync.json', buildCode.includes("'calendar-sync.json'"));
  assert('build-workflows inclui aulas-sync.json', buildCode.includes("'aulas-sync.json'"));
  assert('build-workflows força appendAttribution=false', buildCode.includes('appendAttribution'));

  const workflowFiles = fs.readdirSync(path.join(root, 'workflows')).filter(f => f.endsWith('.json'));
  assert('workflows contém calendar-sync.json', workflowFiles.includes('calendar-sync.json'));
  assert('workflows contém aulas-sync.json', workflowFiles.includes('aulas-sync.json'));

  const deployScript = fs.readFileSync(path.join(root, 'scripts', 'deploy.sh'), 'utf8');
  assert('deploy usa wildcard workflows/*.json', deployScript.includes('"$WORKFLOWS_DIR"/*.json'));

  let telegramNodes = 0;
  let missingAttribution = 0;

  workflowFiles.forEach(file => {
    const wf = JSON.parse(fs.readFileSync(path.join(root, 'workflows', file), 'utf8'));
    (wf.nodes || []).forEach(node => {
      if (node.type !== 'n8n-nodes-base.telegram') return;
      telegramNodes += 1;

      const additional = node.parameters && node.parameters.additionalFields;
      if (!additional || additional.appendAttribution !== false) {
        missingAttribution += 1;
      }
    });
  });

  assert(`Todos os nodes Telegram (${telegramNodes}) sem assinatura do n8n`, missingAttribution === 0,
    `${missingAttribution} node(s) Telegram sem appendAttribution=false`);
}

// =============================================================================
// Resultado
// =============================================================================
console.log('\n' + '='.repeat(50));
const total = passed + failed;
if (failed === 0) {
  console.log(`${GREEN}${BOLD}✔ ${passed}/${total} testes passaram${NC}`);
  process.exit(0);
} else {
  console.log(`${RED}${BOLD}✘ ${failed}/${total} testes falharam${NC}`);
  process.exit(1);
}
