// Daily Briefing — unified formatting for Calendar + Moodle + Classroom + Aulas

function esc(t) { return String(t).replace(/([_*`\[\]])/g, '\\$1'); }

const TZ = 'America/Sao_Paulo';
const nowMs = Date.now();
const in14dMs = nowMs + 14 * 24 * 60 * 60 * 1000;
const in48hMs = nowMs + 48 * 60 * 60 * 1000;

const gcalItems = $items('Google Calendar');
const moodleItem = $items('Moodle API') && $items('Moodle API').length > 0 ? $items('Moodle API')[0].json : {};
const prepItems = $items('Prep Classroom');
const cwItems = $items('Get CourseWork');
const aulasData = $items('Parse Aulas Data') && $items('Parse Aulas Data').length > 0
  ? $items('Parse Aulas Data')[0].json
  : null;

function dayKey(ms) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(ms));

  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

function formatDay(ms) {
  return new Date(ms)
    .toLocaleDateString('pt-BR', {
      timeZone: TZ,
      weekday: 'short',
      day: '2-digit',
      month: '2-digit'
    })
    .toUpperCase();
}

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('pt-BR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parseCalendarStart(start) {
  if (!start) return null;

  if (start.dateTime) {
    const ms = new Date(start.dateTime).getTime();
    if (!Number.isFinite(ms)) return null;
    return { ms, allDay: false };
  }

  if (start.date) {
    const parts = String(start.date).split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;

    const [year, month, day] = parts;
    const ms = Date.UTC(year, month - 1, day, 3, 0, 0);
    return { ms, allDay: true };
  }

  return null;
}

function startOfTodayInTzMs() {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const year = Number(parts.find(p => p.type === 'year').value);
  const month = Number(parts.find(p => p.type === 'month').value);
  const day = Number(parts.find(p => p.type === 'day').value);

  // 00:00 BRT represented in UTC.
  return Date.UTC(year, month - 1, day, 3, 0, 0);
}

function pseudoMsFromOffset(dayOffset, hhmm) {
  const dayMs = 24 * 60 * 60 * 1000;
  const [hh, mm] = String(hhmm || '00:00').split(':').map(Number);
  const minutes = Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : 0;
  return startOfTodayInTzMs() + dayOffset * dayMs + minutes * 60 * 1000;
}

const todayKey = dayKey(nowMs);
const events = [];

function buildEvent(ms, allDay, context, title) {
  const key = dayKey(ms);
  const isToday = key === todayKey;

  let icon = '📌';
  if (isToday) {
    icon = '🔥';
  } else if (ms <= in48hMs) {
    icon = '⚠️';
  }

  return {
    ms,
    allDay,
    icon,
    context,
    title,
    day: formatDay(ms),
    time: allDay ? 'O DIA TODO' : formatTime(ms),
    isToday
  };
}

function formatAbsenceSnippet(absence) {
  if (!absence) return '';

  const faltas = Number.isFinite(Number(absence.faltas)) ? Number(absence.faltas) : null;
  const limite = Number.isFinite(Number(absence.limiteFaltas)) ? Number(absence.limiteFaltas) : null;
  if (!Number.isFinite(faltas) || !Number.isFinite(limite)) return '';

  let restantesInfo = '';
  const restantes = Number.isFinite(Number(absence.faltasRestantes)) ? Number(absence.faltasRestantes) : null;
  if (Number.isFinite(restantes)) {
    restantesInfo = restantes >= 0 ? `, restam ${restantes}` : `, excedeu ${Math.abs(restantes)}`;
  }

  return ` | Faltas ${faltas}/${limite}${restantesInfo}`;
}

// 1) Google Calendar items (keep all-day only for today to reduce noise in briefing)
gcalItems.forEach(item => {
  const event = item.json || {};
  const parsed = parseCalendarStart(event.start);
  if (!parsed) return;

  const isToday = dayKey(parsed.ms) === todayKey;
  if (parsed.allDay && !isToday) return;

  events.push(buildEvent(parsed.ms, parsed.allDay, 'AGENDA', esc(event.summary || 'Sem titulo')));
});

// 2) Moodle items
if (Array.isArray(moodleItem.events)) {
  moodleItem.events.forEach(event => {
    if (!event || !event.timestart) return;

    const ms = Number(event.timestart) * 1000;
    if (!Number.isFinite(ms) || ms < nowMs - 5 * 60 * 1000) return;

    const course = esc(event.course && event.course.shortname ? event.course.shortname.trim() : 'MOODLE');
    const title = esc(event.name || 'Atividade sem titulo');
    events.push(buildEvent(ms, false, course, title));
  });
}

// 3) Classroom items
for (let i = 0; i < prepItems.length; i++) {
  const prep = prepItems[i].json || {};
  if (prep.noCourses) break;

  const coursework = cwItems[i] ? cwItems[i].json : {};
  const works = Array.isArray(coursework.courseWork) ? coursework.courseWork : [];

  works.forEach(work => {
    if (!work.dueDate) return;

    const year = Number(work.dueDate.year);
    const month = Number(work.dueDate.month);
    const day = Number(work.dueDate.day);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return;

    // 23:59 BRT represented in UTC.
    const dueMs = Date.UTC(year, month - 1, day, 2, 59, 0);
    if (!Number.isFinite(dueMs) || dueMs < nowMs || dueMs > in14dMs) return;

    events.push(buildEvent(dueMs, false, esc(prep.courseName || 'CLASSROOM'), esc(work.title || 'Tarefa sem titulo')));
  });
}

// 4) UTFPR classes (/aulas)
if (aulasData && aulasData.ok) {
  const todayClasses = Array.isArray(aulasData.todayClasses) ? aulasData.todayClasses : [];
  const classBlocks = todayClasses.slice(0, 14);

  classBlocks.forEach(block => {
    const dayOffset = Number(block.dayOffset || 0);
    const start = String(block.inicio || '00:00');
    const ms = pseudoMsFromOffset(dayOffset, start);

    const cod = esc(block.cod || 'DISC');
    const disciplina = esc(block.disciplina || 'Aula');
    const sala = block.sala ? ` (Sala ${esc(block.sala)})` : '';
    const faltasInfo = esc(formatAbsenceSnippet(block.absence));
    const title = `${cod} - ${disciplina}${sala}${faltasInfo}`;

    events.push(buildEvent(ms, false, 'AULAS', title));
  });
}

events.sort((a, b) => a.ms - b.ms);

const todayItems = events.filter(event => event.isToday);
const nextItems = events.filter(event => !event.isToday);
const urgentCount = events.filter(event => event.ms > nowMs && event.ms <= in48hMs).length;

function renderItems(items) {
  return items
    .map(item => {
      const context = item.context;
      const title = item.title;
      const when = item.allDay
        ? `${item.day} — O DIA TODO`
        : `${item.day} as ${item.time}`;
      return `• ${item.icon} *[${context}]* ${title}\n  📅 ${when}`;
    })
    .join('\n\n');
}

let message = `📘 *Briefing Integrado — ${formatDay(nowMs)}*\n\n`;

message += '*📊 RESUMO*\n';
message += `• Total: *${events.length}*\n`;
message += `• Hoje: *${todayItems.length}*\n`;
message += `• Urgentes (<48h): *${urgentCount}*\n\n`;

if (aulasData && aulasData.ok) {
  const aulasHoje = Number(aulasData.totals && aulasData.totals.today ? aulasData.totals.today : 0);
  const absRows = Array.isArray(aulasData.todayAbsences) ? aulasData.todayAbsences : [];
  message += `• Aulas hoje: *${aulasHoje}*\n`;

  if (absRows.length > 0) {
    message += '• Faltas: detalhadas por disciplina de hoje\n';
  }

  if (aulasData.hint && aulasData.hint.when === 'hoje') {
    message += `• Dica: arrumar *${esc(aulasData.hint.arrumarAt)}* | sair *${esc(aulasData.hint.sairAt)}*\n`;
  }

  absRows.slice(0, 6).forEach(row => {
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

    message += `• [${cod}] ${disciplina}\n`;
    message += `  Faltas acumuladas: *${faltas}* | Limite: ${limiteTexto}${margemTexto}\n`;
  });

  message += '\n';
}

message += '*🔥 HOJE*\n';
if (todayItems.length === 0) {
  message += '😴 Nenhum item para hoje.\n';
} else {
  message += `${renderItems(todayItems)}\n`;
}

message += '\n*🗂️ PROXIMOS DIAS*\n';
if (nextItems.length === 0) {
  message += '😴 Nenhum item nos proximos dias.';
} else {
  message += renderItems(nextItems);
}

return [{ json: { text: message.trim() } }];
