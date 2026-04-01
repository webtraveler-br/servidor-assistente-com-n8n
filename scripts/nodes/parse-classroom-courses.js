// Classroom Sync — Parse courses response

function esc(t) { return String(t).replace(/([_*`\[\]])/g, '\\$1'); }

const data = $input.first().json || {};
const CLASSROOM_BASE = String($env.CLASSROOM_API_BASE_URL).replace(/\/$/, '');

if (!Array.isArray(data.courses) || data.courses.length === 0) {
  let message = '🏫 *Classroom — Proximas Entregas*\n\n';
  message += '*📊 RESUMO*\n';
  message += '• Total: *0*\n';
  message += '• Hoje: *0*\n';
  message += '• Urgentes (<48h): *0*\n\n';
  message += '*🗂️ AGENDA*\n';
  message += '😴 Nenhuma entrega no periodo.';

  return [{ json: { hasCourses: false, text: message } }];
}

return data.courses.map(course => ({
  json: {
    hasCourses: true,
    courseId: course.id,
    courseName: course.name,
    url: `${CLASSROOM_BASE}/courses/${course.id}/courseWork`
  }
}));
