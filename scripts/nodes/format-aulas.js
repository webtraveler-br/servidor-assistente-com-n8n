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

function countSlotsInBlock(block) {
  const start = Number(block?.slotStart);
  const end = Number(block?.slotEnd);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return end - start + 1;
  }
  return 1;
}

function plural(value, one, many) {
  return Number(value) === 1 ? one : many;
}

function renderBlocks(blocks) {
  return blocks
    .map(block => {
      const cod = esc(block.cod || 'DISC');
      const disciplina = esc(block.disciplina || 'Sem nome');
      const inicio = esc(block.inicio || '--:--');
      const fim = esc(block.fim || '--:--');

      const slots = countSlotsInBlock(block);
      const details = [`${slots} ${plural(slots, 'aula', 'aulas')}`];

      if (block.sala) {
        details.push(`Sala ${esc(block.sala)}`);
      }

      if (block.professor) {
        details.push(`Prof. ${esc(block.professor)}`);
      }

      return `• *${inicio}-${fim}* | *[${cod}]* ${disciplina}\n  ${details.join(' | ')}`;
    })
    .join('\n\n');
}

function formatAbsenceStatus(row) {
  const faltas = Number.isFinite(Number(row.faltas)) ? Number(row.faltas) : 0;
  const limite = Number.isFinite(Number(row.limiteFaltas)) ? Number(row.limiteFaltas) : null;
  const restantes = Number.isFinite(Number(row.faltasRestantes)) ? Number(row.faltasRestantes) : null;

  let status = Number.isFinite(limite)
    ? `Faltas: *${faltas}/${limite}*`
    : `Faltas: *${faltas}*`;

  if (Number.isFinite(limite) && Number.isFinite(restantes)) {
    status += restantes >= 0
      ? ` | Restam *${restantes}*`
      : ` | Excesso *${Math.abs(restantes)}*`;
  }

  return status;
}

function renderAbsences(rows) {
  return rows
    .map(row => {
      const cod = esc(row.cod || 'DISC');
      const disciplina = esc(row.disciplina || 'Sem nome');
      return `• *[${cod}]* ${disciplina}\n  ${formatAbsenceStatus(row)}`;
    })
    .join('\n\n');
}

const todayBlocks = Number.isFinite(Number(totals.todayBlocks))
  ? Number(totals.todayBlocks)
  : todayClasses.length;
const todaySlots = Number.isFinite(Number(totals.todaySlots))
  ? Number(totals.todaySlots)
  : todayClasses.reduce((acc, block) => acc + countSlotsInBlock(block), 0);
const todayDisciplines = Number.isFinite(Number(totals.todayDisciplines))
  ? Number(totals.todayDisciplines)
  : new Set(todayClasses.map(block => String(block.cod || block.disciplina || '').trim()).filter(Boolean)).size;

let text = '*Aulas UTFPR*\n\n';
text += '*RESUMO*\n';
text += `• Curso: *${esc(student.curso || 'N/A')}*\n`;
text += `• Hoje: *${todaySlots}* ${plural(todaySlots, 'aula', 'aulas')} em *${todayBlocks}* ${plural(todayBlocks, 'bloco', 'blocos')}\n`;
text += `• Disciplinas: *${todayDisciplines}*\n`;

if (hint && hint.when === 'hoje') {
  text += `• Dica: arrumar *${esc(hint.arrumarAt)}* | sair *${esc(hint.sairAt)}*\n`;
}

text += '\n*AULAS DE HOJE*\n';
if (todayClasses.length === 0) {
  text += 'Nenhuma aula para hoje.\n';
} else {
  text += `${renderBlocks(todayClasses)}\n`;
}

text += '\n*FREQUENCIA*\n';
if (todayAbsences.length === 0) {
  text += 'Sem dados de faltas para hoje.';
} else {
  text += renderAbsences(todayAbsences);
}

return [{ json: { text: text.trim() } }];