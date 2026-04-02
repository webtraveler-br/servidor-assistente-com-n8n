#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy robusto via git pull no servidor
#
# USO:
#   ./scripts/deploy.sh              Deploy completo (build+lint+test+sync+import+activate+recreate+verify)
#   ./scripts/deploy.sh --skip-tests Pula testes (emergencia)
#   ./scripts/deploy.sh --dry-run    Faz build+lint+test+preflight, sem alterar servidor
#
# PREMISSA:
#   O servidor executa o repositorio em DEPLOY_REMOTE_REPO_DIR.
#   O deploy sincroniza o commit via git pull (ff-only), importa workflows no n8n
#   e recria os containers para aplicar alteracoes de ambiente/compose.
# =============================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKFLOWS_DIR="$PROJECT_DIR/workflows"
SCRIPTS_DIR="$PROJECT_DIR/scripts"
ENV_FILE="$PROJECT_DIR/.env"

# ---------------------------------------------------------------------------
# Cores e helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

STEP=0
step() {
  STEP=$((STEP + 1))
  echo ""
  echo -e "${BLUE}${BOLD}[$STEP] $1${NC}"
  echo "----------------------------------------"
}

ok()   { echo -e "  ${GREEN}OK${NC} $1"; }
warn() { echo -e "  ${YELLOW}WARN${NC} $1"; }
fail() { echo -e "  ${RED}ERRO${NC} $1"; exit 1; }

# ---------------------------------------------------------------------------
# Leitura robusta de .env (sem source)
# ---------------------------------------------------------------------------
read_env_var() {
  local key="$1"
  local line value

  [ -f "$ENV_FILE" ] || return 1

  line=$(grep -m1 -E "^${key}=" "$ENV_FILE" || true)
  value="${line#*=}"

  # trim de espacos nas bordas
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"

  # remove aspas externas opcionais
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "$value"
}

require_non_empty() {
  local name="$1"
  local value="$2"
  [ -n "$value" ] || fail "Variavel obrigatoria vazia: $name"
}

remote_cmd() {
  # SC2086 intencional: SSH_OPTS precisa expandir em multiplos argumentos.
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$SSH_HOST" "$@"
}

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
SKIP_TESTS=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=true ;;
    --dry-run)    DRY_RUN=true ;;
    --help|-h)
      echo "Uso: ./scripts/deploy.sh [--skip-tests] [--dry-run]"
      echo ""
      echo "  --skip-tests  Pula testes de formatacao"
      echo "  --dry-run     Nao altera servidor"
      exit 0
      ;;
    *) fail "Flag desconhecida: $arg" ;;
  esac
done

# ---------------------------------------------------------------------------
# Configuracao de deploy
# ---------------------------------------------------------------------------
[ -f "$ENV_FILE" ] || fail ".env nao encontrado em $PROJECT_DIR"

SSH_HOST="$(read_env_var DEPLOY_SSH_HOST)"
SSH_OPTS="$(read_env_var DEPLOY_SSH_OPTS)"
CONTAINER="$(read_env_var N8N_CONTAINER_NAME)"
REMOTE_REPO_DIR="$(read_env_var DEPLOY_REMOTE_REPO_DIR)"
GIT_REMOTE="$(read_env_var DEPLOY_GIT_REMOTE)"
GIT_BRANCH="$(read_env_var DEPLOY_GIT_BRANCH)"

[ -n "$REMOTE_REPO_DIR" ] || REMOTE_REPO_DIR="/home/fsociety/assistant"
[ -n "$GIT_REMOTE" ] || GIT_REMOTE="origin"
[ -n "$GIT_BRANCH" ] || GIT_BRANCH="main"

require_non_empty DEPLOY_SSH_HOST "$SSH_HOST"
require_non_empty DEPLOY_SSH_OPTS "$SSH_OPTS"
require_non_empty N8N_CONTAINER_NAME "$CONTAINER"
require_non_empty DEPLOY_REMOTE_REPO_DIR "$REMOTE_REPO_DIR"

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}Deploy Pipeline — n8n Server Assistant${NC}"
echo "========================================"
if $DRY_RUN; then warn "Modo DRY RUN (servidor nao sera alterado)"; fi
if $SKIP_TESTS; then warn "Testes serao pulados"; fi

# ---------------------------------------------------------------------------
# 1. Build
# ---------------------------------------------------------------------------
step "Build — Gerando JSONs dos workflows"
[ -f "$SCRIPTS_DIR/build-workflows.js" ] || fail "Arquivo ausente: scripts/build-workflows.js"
node "$SCRIPTS_DIR/build-workflows.js"
ok "Workflows gerados"

# ---------------------------------------------------------------------------
# 2. Lint
# ---------------------------------------------------------------------------
step "Lint — Validando padroes"
node "$SCRIPTS_DIR/lint-workflows.js"
ok "Lint concluido"

# ---------------------------------------------------------------------------
# 3. Test
# ---------------------------------------------------------------------------
if $SKIP_TESTS; then
  step "Test — Pulado"
  warn "Testes pulados por flag"
else
  step "Test — Rodando testes de mensagens"
  [ -f "$SCRIPTS_DIR/test-messages.js" ] || fail "Arquivo ausente: scripts/test-messages.js"
  node "$SCRIPTS_DIR/test-messages.js"
  ok "Testes concluidos"
fi

# ---------------------------------------------------------------------------
# 4. Preflight Git local
# ---------------------------------------------------------------------------
step "Preflight — Validando estado do Git local"

git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Diretorio nao e repositorio Git"

git -C "$PROJECT_DIR" fetch "$GIT_REMOTE" "$GIT_BRANCH" --quiet
LOCAL_HEAD="$(git -C "$PROJECT_DIR" rev-parse HEAD)"
UPSTREAM_HEAD="$(git -C "$PROJECT_DIR" rev-parse "$GIT_REMOTE/$GIT_BRANCH")"

if [ "$LOCAL_HEAD" != "$UPSTREAM_HEAD" ]; then
  fail "HEAD local nao corresponde a $GIT_REMOTE/$GIT_BRANCH. Faça push antes de deployar."
fi

if [ -n "$(git -C "$PROJECT_DIR" status --porcelain)" ]; then
  warn "Repositorio local com alteracoes nao commitadas (deploy seguira usando HEAD atual)."
fi
ok "Commit local sincronizado com $GIT_REMOTE/$GIT_BRANCH ($(git -C "$PROJECT_DIR" rev-parse --short HEAD))"

if $DRY_RUN; then
  echo ""
  echo -e "${GREEN}${BOLD}OK Dry run concluido.${NC}"
  exit 0
fi

# ---------------------------------------------------------------------------
# 5. Sync — git pull no servidor
# ---------------------------------------------------------------------------
step "Sync — Atualizando repositorio no servidor"

remote_cmd "set -euo pipefail; cd '$REMOTE_REPO_DIR'; test -d .git; git fetch '$GIT_REMOTE' '$GIT_BRANCH'; git checkout '$GIT_BRANCH'; git pull --ff-only '$GIT_REMOTE' '$GIT_BRANCH'" \
  || fail "Falha ao sincronizar repositorio remoto"

REMOTE_HEAD="$(remote_cmd "cd '$REMOTE_REPO_DIR' && git rev-parse HEAD")"
if [ "$REMOTE_HEAD" != "$LOCAL_HEAD" ]; then
  fail "HEAD remoto ($REMOTE_HEAD) difere do local ($LOCAL_HEAD)"
fi
ok "Servidor sincronizado no commit $(printf '%s' "$REMOTE_HEAD" | cut -c1-7)"

# ---------------------------------------------------------------------------
# 6. Import — Workflows do repositorio remoto para o n8n
# ---------------------------------------------------------------------------
step "Import — Importando workflows no n8n"

remote_cmd "docker ps --filter name=$CONTAINER --format '{{.Names}}' | grep -q '^$CONTAINER$'" \
  || fail "Container $CONTAINER nao esta rodando"
ok "Container $CONTAINER ativo"

remote_cmd "docker exec $CONTAINER rm -rf /tmp/workflows && docker exec $CONTAINER mkdir -p /tmp/workflows"
ok "Pasta temporaria do container preparada"

WORKFLOW_FILES=$(ls "$WORKFLOWS_DIR"/*.json)
[ -n "$WORKFLOW_FILES" ] || fail "Nenhum workflow encontrado em $WORKFLOWS_DIR"

for f in $WORKFLOW_FILES; do
  fname="$(basename "$f")"
  wf_name="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$f','utf8')).name)")"

  remote_cmd "test -f '$REMOTE_REPO_DIR/workflows/$fname'" \
    || fail "Arquivo nao encontrado no servidor: $REMOTE_REPO_DIR/workflows/$fname"

  remote_cmd "docker cp '$REMOTE_REPO_DIR/workflows/$fname' '$CONTAINER:/tmp/workflows/$fname'"
  remote_cmd "docker exec $CONTAINER n8n import:workflow --input=/tmp/workflows/$fname" > /dev/null 2>&1 \
    || fail "Falha ao importar $fname"

  ok "$wf_name ($fname)"
done

# ---------------------------------------------------------------------------
# 7. Activate — Ativar todos os workflows conhecidos
# ---------------------------------------------------------------------------
step "Activate — Ativando workflows"

for f in $WORKFLOW_FILES; do
  wf_id="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$f','utf8')).id)")"
  wf_name="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$f','utf8')).name)")"

  remote_cmd "docker exec $CONTAINER n8n update:workflow --id=$wf_id --active=true" > /dev/null 2>&1 \
    || fail "Falha ao ativar $wf_name ($wf_id)"

  ok "$wf_name ($wf_id)"
done

# ---------------------------------------------------------------------------
# 8. Recreate — Aplicar alteracoes de compose/env
# ---------------------------------------------------------------------------
step "Recreate — Recriando stack"

remote_cmd "cd '$REMOTE_REPO_DIR' && docker compose up -d --force-recreate" \
  || fail "Falha ao recriar stack com docker compose"

remote_cmd "docker ps --filter name=$CONTAINER --format '{{.Status}}' | grep -q 'Up'" \
  || fail "Container $CONTAINER nao ficou em estado Up"
ok "Stack recriada e container ativo"

# ---------------------------------------------------------------------------
# 9. Verify — Confirmar workflows no servidor
# ---------------------------------------------------------------------------
step "Verify — Confirmando workflows"

REMOTE_LIST="$(remote_cmd "docker exec $CONTAINER n8n list:workflow" 2>&1)"

for f in $WORKFLOW_FILES; do
  wf_id="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$f','utf8')).id)")"
  wf_name="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$f','utf8')).name)")"

  if echo "$REMOTE_LIST" | grep -q "$wf_id"; then
    ok "$wf_name ($wf_id)"
  else
    fail "$wf_name ($wf_id) nao encontrado no n8n"
  fi
done

# ---------------------------------------------------------------------------
# Sucesso
# ---------------------------------------------------------------------------
echo ""
echo "========================================"
echo -e "${GREEN}${BOLD}OK Deploy concluido com sucesso${NC}"
echo -e "Commit: ${BOLD}$(printf '%s' "$LOCAL_HEAD" | cut -c1-7)${NC}"
echo -e "Servidor: ${BOLD}$SSH_HOST${NC}"
echo "========================================"
