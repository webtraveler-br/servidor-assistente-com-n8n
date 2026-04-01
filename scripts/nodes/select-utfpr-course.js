// UTFPR Aulas — Select student course and preserve auth token

const authPayload = $items('UTFPR Auth')[0]?.json || {};
const dadosPayload = $input.first().json || {};

const token = String(authPayload.token || '').trim();
if (!token) {
  return [{
    json: {
      ok: false,
      error: 'auth_failed',
      detail: String(authPayload.message || authPayload.error || 'Token ausente no auth').trim()
    }
  }];
}

const cursosRoot = Array.isArray(dadosPayload?.cursos) ? dadosPayload.cursos : [];
const cursosAluno = Array.isArray(dadosPayload?.aluno?.cursos) ? dadosPayload.aluno.cursos : [];
const cursos = cursosRoot.length > 0 ? cursosRoot : cursosAluno;
const preferredCod = String($env.UTFPR_COD_ALUNO || '').trim();

let selected = null;
if (preferredCod) {
  selected = cursos.find(course => String(course?.alCuIdVc || '') === preferredCod) || null;
}
if (!selected) {
  selected = cursos[0] || null;
}

if (!selected || !selected.alCuIdVc) {
  return [{
    json: {
      ok: false,
      error: 'course_not_found',
      detail: 'Nao foi possivel determinar codAluno em /dados para consultar horario',
      token
    }
  }];
}

return [{
  json: {
    ok: true,
    token,
    codAluno: String(selected.alCuIdVc),
    cursoNome: String(selected.cursNomeVc || selected.curso || ''),
    nomeAluno: String(dadosPayload.pessNomeVc || dadosPayload.nome || ''),
    ra: String(dadosPayload.login || dadosPayload.ra || ''),
    preferredCod
  }
}];