// UTFPR Aulas — Format parsed classes into Telegram Markdown

function esc(t) { return String(t).replace(/([_*`\[\]])/g, '\\$1'); }

const payload = $input.first().json || {};

if (!payload.ok) {
  const detail = String(payload.detail || '').trim();
  let text = '*Aulas UTFPR*\n\n';
  text += 'Nao foi possivel consultar o horario agora.\n';
  if (detail) {
    text += `Detalhe: ${esc(detail)}\n`;
  }
  text += '\nConfira as variaveis UTFPR\_PORTAL\_USERNAME / UTFPR\_PORTAL\_PASSWORD e tente novamente.';
  return [{ json: { text } }];
}

const student = payload.student || {};
const totals = payload.totals || {};
const todayClasses = Array.isArray(payload.todayClasses) ? payload.todayClasses : [];
const todayAbsences = Array.isArray(payload.todayAbsences) ? payload.todayAbsences : [];
const hint = payload.hint || null;

function classTitle(block) {
  const cod = esc(block.cod || 'DISC');
  const disciplina = esc(block.disciplina || 'Sem nome');
  return `*[${cod}]* ${disciplina}`;
}

function classMeta(block) {
  const room = block.sala ? ` | Sala: ${esc(block.sala)}` : '';
  const prof = block.professor ? ` | Prof: ${esc(block.professor)}` : '';
  return `${esc(block.dayLabel)} ${esc(block.inicio)}-${esc(block.fim)}${room}${prof}`;
}

function renderBlocks(blocks) {
  return blocks
    .map(block => `• ${classTitle(block)}\n  ${classMeta(block)}`)
    .join('\n\n');
}

function renderAbsences(rows) {
  return rows
    .map(row => {
      const cod = esc(row.cod || 'DISC');
      const disciplina = esc(row.disciplina || 'Sem nome');
      const faltas = Number.isFinite(Number(row.faltas)) ? Number(row.faltas) : 0;
      const limite = Number.isFinite(Number(row.limiteFaltas)) ? Number(row.limiteFaltas) : null;
      const restantes = Number.isFinite(Number(row.faltasRestantes)) ? Number(row.faltasRestantes) : null;

      const limiteTexto = Number.isFinite(limite) ? `*${limite}*` : 'indisponivel';
      let margemTexto = '';
      if (Number.isFinite(restantes)) {
        margemTexto = restantes >= 0
          ? ` | Margem ate limite: *${restantes}*`
          : ` | Acima do limite: *${Math.abs(restantes)}*`;
      }

      return `• *[${cod}]* ${disciplina}\n  Faltas acumuladas: *${faltas}* | Limite: ${limiteTexto}${margemTexto}`;
    })
    .join('\n\n');
}

let text = '*Aulas UTFPR*\n\n';
text += '*RESUMO*\n';
text += `• Curso: *${esc(student.curso || 'N/A')}*\n`;
text += `• Aulas hoje: *${Number(totals.today || 0)}*\n`;
text += `• Disciplinas hoje: *${todayAbsences.length}*\n`;

if (todayAbsences.length > 0) {
  text += '• Faltas: veja por disciplina na secao abaixo\n';
}

if (hint && hint.when === 'hoje') {
  text += `• Hoje: arrumar *${esc(hint.arrumarAt)}* | sair *${esc(hint.sairAt)}*\n`;
}

text += '\n*HOJE*\n';
if (todayClasses.length === 0) {
  text += 'Nenhuma aula para hoje.\n';
} else {
  text += `${renderBlocks(todayClasses)}\n`;
}

text += '\n*FALTAS DAS MATERIAS DE HOJE*\n';
if (todayAbsences.length === 0) {
  text += 'Nenhum registro de faltas para as disciplinas de hoje.';
} else {
  text += renderAbsences(todayAbsences);
}

return [{ json: { text: text.trim() } }];