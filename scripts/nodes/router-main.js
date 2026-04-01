// Main Router — command and keyword routing

const ALLOWED_CHAT_ID = parseInt($env.TELEGRAM_CHAT_ID, 10);
const message = $input.first().json.message || {};
const chatId = message.chat && message.chat.id;

if (!Number.isFinite(ALLOWED_CHAT_ID) || chatId !== ALLOWED_CHAT_ID) {
  return [];
}

const rawText = String(message.text || '').trim();
const text = rawText.toLowerCase();

const WORKFLOW_IDS = {
  'daily-briefing': 'KZPDjrKOkeo5VEgr',
  'calendar-sync': 'calendarSync2468',
  'aulas-sync': 'aulasSync24680',
  'moodle-sync': 'moodleSync123456',
  'classroom-sync': 'classroomSync789',
  'general-qa': 'qaPatch429'
};

function hasAny(words) {
  return words.some(word => text.includes(word));
}

let route = 'general-qa';

if (/^\/briefing\b/.test(text)) {
  route = 'daily-briefing';
} else if (/^\/(calendar|calendario)\b/.test(text)) {
  route = 'calendar-sync';
} else if (/^\/(aulas|horario)\b/.test(text)) {
  route = 'aulas-sync';
} else if (/^\/moodle\b/.test(text)) {
  route = 'moodle-sync';
} else if (/^\/classroom\b/.test(text)) {
  route = 'classroom-sync';
} else if (hasAny(['briefing', 'hoje', 'semana'])) {
  route = 'daily-briefing';
} else if (hasAny(['aulas', 'horario de aula', 'horario das aulas', 'faltas', 'frequencia'])) {
  route = 'aulas-sync';
} else if (hasAny(['moodle', 'ava', 'utfpr'])) {
  route = 'moodle-sync';
} else if (hasAny(['classroom', 'tarefa', 'atividade da turma'])) {
  route = 'classroom-sync';
} else if (hasAny(['calendario', 'agenda', 'compromisso', 'evento'])) {
  route = 'calendar-sync';
}

const workflowId = WORKFLOW_IDS[route] || WORKFLOW_IDS['general-qa'];

return [
  {
    json: {
      route,
      workflowId,
      original_message: message
    }
  }
];
