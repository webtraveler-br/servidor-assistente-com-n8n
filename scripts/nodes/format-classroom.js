// Classroom Sync — Format assignments for Telegram

function esc(t) { return String(t).replace(/([_*`\[\]])/g, '\\$1'); }

const TZ = 'America/Sao_Paulo';
const nowMs = Date.now();
const in14dMs = nowMs + 14 * 24 * 60 * 60 * 1000;
const in48hMs = nowMs + 48 * 60 * 60 * 1000;
const allItems = $input.all();

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

const todayKey = dayKey(nowMs);

const upcoming = [];

allItems.forEach(item => {
  const data = item.json || {};
  const courseName = data.courseName || 'CLASSROOM';
  const works = Array.isArray(data.courseWork) ? data.courseWork : [];

  works.forEach(work => {
    if (!work.dueDate) return;

    const year = Number(work.dueDate.year);
    const month = Number(work.dueDate.month);
    const day = Number(work.dueDate.day);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return;

    // 23:59 BRT represented in UTC.
    const dueMs = Date.UTC(year, month - 1, day, 2, 59, 0);
    if (!Number.isFinite(dueMs) || dueMs < nowMs || dueMs > in14dMs) return;

    const isToday = dayKey(dueMs) === todayKey;

    let icon = '📌';
    if (isToday) {
      icon = '🔥';
    } else if (dueMs <= in48hMs) {
      icon = '⚠️';
    }

    upcoming.push({
      ms: dueMs,
      icon,
      context: esc(courseName),
      title: esc(work.title || 'Tarefa sem titulo'),
      day: formatDay(dueMs),
      time: '23:59',
      isToday
    });
  });
});

upcoming.sort((a, b) => a.ms - b.ms);

const todayCount = upcoming.filter(item => item.isToday).length;
const urgentCount = upcoming.filter(item => item.ms > nowMs && item.ms <= in48hMs).length;

let message = '🏫 *Classroom — Proximas Entregas*\n\n';
message += '*📊 RESUMO*\n';
message += `• Total: *${upcoming.length}*\n`;
message += `• Hoje: *${todayCount}*\n`;
message += `• Urgentes (<48h): *${urgentCount}*\n\n`;

message += '*🗂️ AGENDA*\n';
if (upcoming.length === 0) {
  message += '😴 Nenhuma entrega no periodo.';
} else {
  message += upcoming
    .map(item => {
      const context = item.context;
      const title = item.title;
      return `• ${item.icon} *[${context}]* ${title}\n  📅 ${item.day} as ${item.time}`;
    })
    .join('\n\n');
}

return [{ json: { text: message.trim() } }];
