// UTFPR Aulas — Parse auth/dados/horario/boletim payloads into reusable data

const TZ = 'America/Sao_Paulo';
const DAY_LABELS = {
  1: 'DOM',
  2: 'SEG',
  3: 'TER',
  4: 'QUA',
  5: 'QUI',
  6: 'SEX',
  7: 'SAB'
};

const TURN_ORDER = { M: 0, T: 1, N: 2 };
const SLOT_TIMES = {
  M: {
    1: ['07:30', '08:20'],
    2: ['08:20', '09:10'],
    3: ['09:10', '10:00'],
    4: ['10:20', '11:10'],
    5: ['11:10', '12:00'],
    6: ['12:00', '12:50']
  },
  T: {
    1: ['13:00', '13:50'],
    2: ['13:50', '14:40'],
    3: ['14:40', '15:30'],
    4: ['15:50', '16:40'],
    5: ['16:40', '17:30'],
    6: ['17:30', '18:20']
  },
  N: {
    1: ['18:40', '19:30'],
    2: ['19:30', '20:20'],
    3: ['20:20', '21:10'],
    4: ['21:20', '22:10'],
    5: ['22:10', '23:00']
  }
};

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toMinutes(hhmm) {
  const [hh, mm] = String(hhmm || '00:00').split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

function shiftHHmm(hhmm, deltaMinutes) {
  const total = ((toMinutes(hhmm) + deltaMinutes) % 1440 + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function nowInfoInTz() {
  const now = new Date();
  const weekdayShort = now.toLocaleDateString('en-US', {
    timeZone: TZ,
    weekday: 'short'
  });

  const weekdayMap = {
    Sun: 1,
    Mon: 2,
    Tue: 3,
    Wed: 4,
    Thu: 5,
    Fri: 6,
    Sat: 7
  };

  const todayDayNumber = weekdayMap[weekdayShort] || 1;

  const timeParts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(now);

  const hh = Number(timeParts.find(part => part.type === 'hour')?.value || 0);
  const mm = Number(timeParts.find(part => part.type === 'minute')?.value || 0);
  return {
    todayDayNumber,
    nowMinutes: hh * 60 + mm
  };
}

function parseHoraDescr(code) {
  const raw = String(code || '').trim().toUpperCase();
  const match = raw.match(/^(\d)([MTN])(\d)$/);
  if (!match) return null;

  const dia = Number(match[1]);
  const turno = match[2];
  const slot = Number(match[3]);

  if (!DAY_LABELS[dia]) return null;
  if (!SLOT_TIMES[turno] || !SLOT_TIMES[turno][slot]) return null;

  return { dia, turno, slot };
}

function parseHorarioPayload(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  const slots = [];

  rows.forEach(row => {
    const disciplina = String(row?.discNomeVc || '').trim();
    const cod = String(row?.discCodVelhoVc || '').trim();
    const horarios = Array.isArray(row?.horarios) ? row.horarios : [];
    const professores = Array.isArray(row?.professores) ? row.professores : [];
    const professor = String(professores[0]?.pessNomeVc || '').trim();

    horarios.forEach(h => {
      const parsed = parseHoraDescr(h?.horaDescrVc);
      if (!parsed) return;

      const slotWindow = SLOT_TIMES[parsed.turno][parsed.slot];
      const sala = String(h?.ambienteNomeVc || '').trim();

      slots.push({
        dia: parsed.dia,
        dayLabel: DAY_LABELS[parsed.dia],
        turno: parsed.turno,
        slot: parsed.slot,
        inicio: slotWindow[0],
        fim: slotWindow[1],
        disciplina,
        cod,
        sala,
        professor
      });
    });
  });

  slots.sort((a, b) => {
    if (a.dia !== b.dia) return a.dia - b.dia;
    if (a.turno !== b.turno) return TURN_ORDER[a.turno] - TURN_ORDER[b.turno];
    return a.slot - b.slot;
  });

  return slots;
}

function mergeConsecutiveSlots(slots) {
  const merged = [];

  slots.forEach(slot => {
    const prev = merged[merged.length - 1];
    const canMerge =
      prev &&
      prev.dia === slot.dia &&
      prev.turno === slot.turno &&
      prev.disciplina === slot.disciplina &&
      prev.cod === slot.cod &&
      prev.slotEnd + 1 === slot.slot;

    if (!canMerge) {
      merged.push({
        dia: slot.dia,
        dayLabel: slot.dayLabel,
        turno: slot.turno,
        slotStart: slot.slot,
        slotEnd: slot.slot,
        inicio: slot.inicio,
        fim: slot.fim,
        disciplina: slot.disciplina,
        cod: slot.cod,
        salas: slot.sala ? [slot.sala] : [],
        professor: slot.professor
      });
      return;
    }

    prev.slotEnd = slot.slot;
    prev.fim = slot.fim;

    if (slot.sala && !prev.salas.includes(slot.sala)) {
      prev.salas.push(slot.sala);
    }

    if (!prev.professor && slot.professor) {
      prev.professor = slot.professor;
    }
  });

  return merged.map(item => ({
    dia: item.dia,
    dayLabel: item.dayLabel,
    dayOffset: 0,
    turno: item.turno,
    slotStart: item.slotStart,
    slotEnd: item.slotEnd,
    inicio: item.inicio,
    fim: item.fim,
    disciplina: item.disciplina,
    cod: item.cod,
    sala: item.salas.join('/'),
    professor: item.professor || ''
  }));
}

function parseBoletimPayload(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  const map = {};

  rows.forEach(row => {
    const cod = String(row?.discCodVelhoVc || '').trim();
    if (!cod) return;

    const faltas = safeNumber(row?.faltas, 0);
    const aulasDadas = safeNumber(row?.aulasDadas, 0);
    const aulasPrevistas = safeNumber(row?.aulasPrevistas, 0);
    const limiteFaltas = aulasPrevistas > 0 ? Math.floor(aulasPrevistas * 0.25) : null;

    map[cod] = {
      faltas,
      aulasDadas,
      aulasPrevistas,
      limiteFaltas,
      faltasRestantes: Number.isFinite(limiteFaltas) ? limiteFaltas - faltas : null,
      faltaPercent: aulasDadas > 0 ? Number(((100 * faltas) / aulasDadas).toFixed(1)) : null
    };
  });

  return map;
}

const authPayload = $items('UTFPR Auth')[0]?.json || {};
const selectedCourse = $items('Select UTFPR Course')[0]?.json || {};
const horarioPayload = $items('UTFPR Horario')[0]?.json || [];
const boletimPayload = $items('UTFPR Boletim')[0]?.json || [];

if (!selectedCourse.ok) {
  const detail = String(selectedCourse.detail || authPayload.message || authPayload.error || '').trim();
  return [{
    json: {
      ok: false,
      error: selectedCourse.error || 'utfpr_data_unavailable',
      detail,
      todayClasses: [],
      todayAbsences: [],
      hint: null
    }
  }];
}

const nowInfo = nowInfoInTz();
const slots = parseHorarioPayload(horarioPayload);
const mergedBlocks = mergeConsecutiveSlots(slots);
const absencesByCode = parseBoletimPayload(boletimPayload);

const blocks = mergedBlocks.map(block => {
  const dayOffset = (block.dia - nowInfo.todayDayNumber + 7) % 7;
  const absence = block.cod ? absencesByCode[block.cod] || null : null;
  return {
    ...block,
    dayOffset,
    absence
  };
});

blocks.sort((a, b) => {
  if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
  if (a.turno !== b.turno) return TURN_ORDER[a.turno] - TURN_ORDER[b.turno];
  return a.slotStart - b.slotStart;
});

const todayClasses = blocks
  .filter(block => block.dayOffset === 0)
  .sort((a, b) => toMinutes(a.inicio) - toMinutes(b.inicio));

const futureBlocks = blocks
  .filter(block => block.dayOffset > 0)
  .sort((a, b) => {
    if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
    return toMinutes(a.inicio) - toMinutes(b.inicio);
  });

let nextClasses = [];
if (futureBlocks.length > 0) {
  const nextDayOffset = futureBlocks[0].dayOffset;
  nextClasses = futureBlocks.filter(block => block.dayOffset === nextDayOffset);
}

const nowOrUpcomingToday = todayClasses
  .filter(block => toMinutes(block.fim) >= nowInfo.nowMinutes)
  .sort((a, b) => toMinutes(a.inicio) - toMinutes(b.inicio));

let hint = null;
const prepMinutes = safeNumber($env.UTFPR_PREP_MINUTES, 45);
const commuteMinutes = safeNumber($env.UTFPR_COMMUTE_MINUTES, 20);

if (nowOrUpcomingToday.length > 0) {
  const first = nowOrUpcomingToday[0];
  hint = {
    when: 'hoje',
    dayLabel: first.dayLabel,
    classStartsAt: first.inicio,
    arrumarAt: shiftHHmm(first.inicio, -prepMinutes),
    sairAt: shiftHHmm(first.inicio, -commuteMinutes),
    prepMinutes,
    commuteMinutes
  };
}

const todayAbsences = [];
const seenTodayDisciplines = new Set();

todayClasses.forEach(block => {
  const disciplineKey = String(block.cod || block.disciplina || '').trim();
  if (!disciplineKey || seenTodayDisciplines.has(disciplineKey)) return;

  seenTodayDisciplines.add(disciplineKey);
  const abs = block.absence || {};

  todayAbsences.push({
    cod: String(block.cod || ''),
    disciplina: String(block.disciplina || ''),
    faltas: safeNumber(abs.faltas, 0),
    aulasDadas: Number.isFinite(Number(abs.aulasDadas)) ? Number(abs.aulasDadas) : null,
    aulasPrevistas: Number.isFinite(Number(abs.aulasPrevistas)) ? Number(abs.aulasPrevistas) : null,
    limiteFaltas: Number.isFinite(Number(abs.limiteFaltas)) ? Number(abs.limiteFaltas) : null,
    faltasRestantes: Number.isFinite(Number(abs.faltasRestantes)) ? Number(abs.faltasRestantes) : null,
    faltaPercent: Number.isFinite(Number(abs.faltaPercent)) ? Number(abs.faltaPercent) : null
  });
});

todayAbsences.sort((a, b) => String(a.disciplina).localeCompare(String(b.disciplina), 'pt-BR'));

const absencesSummary = todayAbsences.reduce(
  (acc, row) => {
    acc.disciplines += 1;
    acc.totalFaltas += safeNumber(row.faltas, 0);
    if (Number.isFinite(row.limiteFaltas)) {
      acc.totalLimiteFaltas += row.limiteFaltas;
    }
    if (Number.isFinite(row.faltasRestantes)) {
      acc.totalRestantes += row.faltasRestantes;
    }
    return acc;
  },
  { disciplines: 0, totalFaltas: 0, totalLimiteFaltas: 0, totalRestantes: 0 }
);

return [{
  json: {
    ok: true,
    source: 'utfpr-aulas',
    generatedAtMs: Date.now(),
    todayDayNumber: nowInfo.todayDayNumber,
    student: {
      nome: String(selectedCourse.nomeAluno || ''),
      ra: String(selectedCourse.ra || ''),
      curso: String(selectedCourse.cursoNome || ''),
      codAluno: String(selectedCourse.codAluno || '')
    },
    totals: {
      slots: slots.length,
      blocks: blocks.length,
      today: todayClasses.length,
      next: nextClasses.length
    },
    hint,
    absencesSummary,
    todayAbsences,
    todayClasses,
    nextClasses,
    allBlocks: blocks
  }
}];