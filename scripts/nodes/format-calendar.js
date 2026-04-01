// Calendar Sync — Format Google Calendar events for Telegram

function esc(t) { return String(t).replace(/([_*`\[\]])/g, '\\$1'); }

const TZ = 'America/Sao_Paulo';
const nowMs = Date.now();
const items = $input.all();

function getDayKey(ms) {
  const d = new Date(ms);
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const year = p.find(x => x.type === 'year').value;
  const month = p.find(x => x.type === 'month').value;
  const day = p.find(x => x.type === 'day').value;
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

const todayKey = getDayKey(nowMs);
const in24hMs = nowMs + 24 * 60 * 60 * 1000;

const events = items
  .map(item => item.json || {})
  .map(ev => {
    const parsed = parseCalendarStart(ev.start);
    if (!parsed) return null;

    const dayKey = getDayKey(parsed.ms);
    const isToday = dayKey === todayKey;

    let icon = '📌';
    if (isToday) {
      icon = '🔥';
    } else if (parsed.ms <= in24hMs) {
      icon = '⚠️';
    }

    return {
      ms: parsed.ms,
      allDay: parsed.allDay,
      icon,
      title: esc(ev.summary || 'Sem titulo'),
      context: 'AGENDA',
      day: formatDay(parsed.ms),
      time: parsed.allDay ? 'O DIA TODO' : formatTime(parsed.ms),
      isToday
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.ms - b.ms);

const todayCount = events.filter(e => e.isToday).length;

let message = '🗓️ *Calendario — Proximos 7 dias*\n\n';
message += '*📊 RESUMO*\n';
message += `• Total: *${events.length}*\n`;
message += `• Hoje: *${todayCount}*\n`;
message += `• Proximos dias: *${events.length - todayCount}*\n\n`;

message += '*🗂️ AGENDA*\n';
if (events.length === 0) {
  message += '😴 Nenhum evento no periodo.';
} else {
  message += events
    .map(event => {
      const context = event.context;
      const title = event.title;
      const when = event.allDay
        ? `${event.day} — O DIA TODO`
        : `${event.day} as ${event.time}`;
      return `• ${event.icon} *[${context}]* ${title}\n  📅 ${when}`;
    })
    .join('\n\n');
}

return [{ json: { text: message.trim() } }];
