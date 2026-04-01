// Moodle Sync — Format Moodle events for Telegram

function esc(t) { return String(t).replace(/([_*`\[\]])/g, '\\$1'); }

const TZ = 'America/Sao_Paulo';
const nowMs = Date.now();
const in48hMs = nowMs + 48 * 60 * 60 * 1000;
const rawEvents = Array.isArray($input.first().json?.events) ? $input.first().json.events : [];

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

const todayKey = dayKey(nowMs);

const events = rawEvents
  .map(event => {
    if (!event || !event.timestart) return null;

    const ms = Number(event.timestart) * 1000;
    if (!Number.isFinite(ms) || ms < nowMs - 5 * 60 * 1000) return null;

    const isToday = dayKey(ms) === todayKey;

    let icon = '📌';
    if (isToday) {
      icon = '🔥';
    } else if (ms <= in48hMs) {
      icon = '⚠️';
    }

    return {
      ms,
      icon,
      context: esc(event.course && event.course.shortname ? event.course.shortname.trim() : 'MOODLE'),
      title: esc(event.name || 'Atividade sem titulo'),
      day: formatDay(ms),
      time: formatTime(ms),
      isToday
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.ms - b.ms);

const todayCount = events.filter(event => event.isToday).length;
const urgentCount = events.filter(event => event.ms > nowMs && event.ms <= in48hMs).length;

let message = '🎓 *Moodle — Proximos Itens*\n\n';
message += '*📊 RESUMO*\n';
message += `• Total: *${events.length}*\n`;
message += `• Hoje: *${todayCount}*\n`;
message += `• Urgentes (<48h): *${urgentCount}*\n\n`;

message += '*🗂️ AGENDA*\n';
if (events.length === 0) {
  message += '😴 Nenhum item no periodo.';
} else {
  message += events
    .map(event => {
      const context = event.context;
      const title = event.title;
      return `• ${event.icon} *[${context}]* ${title}\n  📅 ${event.day} as ${event.time}`;
    })
    .join('\n\n');
}

return [{ json: { text: message.trim() } }];
