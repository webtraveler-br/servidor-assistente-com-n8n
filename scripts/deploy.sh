#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Pipeline completo de deploy para o n8n
#
# USO:
#   ./scripts/deploy.sh              Deploy completo (build+lint+test+upload+import+activate+restart+verify)
#   ./scripts/deploy.sh --skip-tests Pula os testes (emergência)
#   ./scripts/deploy.sh --dry-run    Faz build+lint+test mas NÃO sobe pro servidor
#
# O QUE FAZ (em ordem):
#   1. Build   — Gera os JSONs a partir dos scripts JS
#   2. Lint    — Valida padrões (esc(), parse_mode, onError)
#   3. Test    — Testa formatação com dados mock
#   4. Upload  — Copia JSONs pro servidor via SCP
#   5. Import  — Copia pro container e importa via n8n CLI
#   6. Activate — Ativa todos os workflows
#   7. Restart — Reinicia o container n8n
#   8. Verify  — Confirma que todos os workflows estão listados
#
# SE ALGO FALHAR: o script PARA imediatamente e mostra o erro.
# =============================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
fi

# ---------------------------------------------------------------------------
# Configuração — edite aqui se mudar servidor/paths
# ---------------------------------------------------------------------------
SSH_HOST="${DEPLOY_SSH_HOST}"
SSH_OPTS="${DEPLOY_SSH_OPTS}"
REMOTE_TMP="${DEPLOY_REMOTE_TMP}"
CONTAINER="${N8N_CONTAINER_NAME}"
WORKFLOWS_DIR="$PROJECT_DIR/workflows"
SCRIPTS_DIR="$PROJECT_DIR/scripts"

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
  echo "────────────────────────────────────────"
}

ok()   { echo -e "  ${GREEN}✔${NC} $1"; }
fail() { echo -e "  ${RED}✘ ERRO: $1${NC}"; exit 1; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
info() { echo -e "  $1"; }

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
      echo "  --skip-tests  Pula testes de formatação (emergência)"
      echo "  --dry-run     Build+lint+test local, sem subir pro servidor"
      exit 0
      ;;
    *) fail "Flag desconhecida: $arg. Use --help para ver opções." ;;
  esac
done

echo ""
echo -e "${BOLD}🚀 Deploy Pipeline — n8n Personal Assistant${NC}"
echo "============================================"
if $DRY_RUN; then warn "Modo DRY RUN — nada será enviado ao servidor"; fi
if $SKIP_TESTS; then warn "Testes serão pulados"; fi

# ---------------------------------------------------------------------------
# 1. Build
# ---------------------------------------------------------------------------
step "Build — Gerando JSONs a partir dos scripts JS"

if [ ! -f "$SCRIPTS_DIR/build-workflows.js" ]; then
  fail "build-workflows.js não encontrado em $SCRIPTS_DIR"
fi

node "$SCRIPTS_DIR/build-workflows.js"
ok "Workflows gerados com sucesso"

# ---------------------------------------------------------------------------
# 2. Lint
# ---------------------------------------------------------------------------
step "Lint — Validando padrões de qualidade"

node "$SCRIPTS_DIR/lint-workflows.js"
LINT_EXIT=$?
if [ $LINT_EXIT -ne 0 ]; then
  fail "Lint encontrou erros. Corrija antes de deployar."
fi
ok "Lint passou"

# ---------------------------------------------------------------------------
# 3. Test
# ---------------------------------------------------------------------------
if $SKIP_TESTS; then
  step "Test — PULADO (--skip-tests)"
  warn "Testes pulados por flag"
else
  step "Test — Testando formatação com dados mock"

  if [ ! -f "$SCRIPTS_DIR/test-messages.js" ]; then
    fail "test-messages.js não encontrado em $SCRIPTS_DIR"
  fi

  node "$SCRIPTS_DIR/test-messages.js"
  TEST_EXIT=$?
  if [ $TEST_EXIT -ne 0 ]; then
    fail "Testes falharam. Corrija antes de deployar."
  fi
  ok "Todos os testes passaram"
fi

# ---------------------------------------------------------------------------
# Se dry-run, para aqui
# ---------------------------------------------------------------------------
if $DRY_RUN; then
  echo ""
  echo -e "${GREEN}${BOLD}✔ Dry run completo. Nenhuma alteração foi feita no servidor.${NC}"
  exit 0
fi

# ---------------------------------------------------------------------------
# 4. Upload — SCP para o servidor
# ---------------------------------------------------------------------------
step "Upload — Copiando workflows para o servidor"

# Testar SSH primeiro
ssh $SSH_OPTS "$SSH_HOST" "echo ok" > /dev/null 2>&1 \
  || fail "Não consegui conectar via SSH em $SSH_HOST. Verifique Tailscale/rede."
ok "SSH conectado"

# Criar diretório remoto e copiar
ssh $SSH_OPTS "$SSH_HOST" "mkdir -p $REMOTE_TMP"
scp -q "$WORKFLOWS_DIR"/*.json "$SSH_HOST:$REMOTE_TMP/"
ok "$(ls "$WORKFLOWS_DIR"/*.json | wc -l) arquivos copiados para $SSH_HOST:$REMOTE_TMP/"

# ---------------------------------------------------------------------------
# 5. Import — Docker cp + n8n import
# ---------------------------------------------------------------------------
step "Import — Importando workflows no n8n"

# Verificar container rodando
ssh $SSH_OPTS "$SSH_HOST" "docker ps --filter name=$CONTAINER --format '{{.Names}}'" | grep -q "$CONTAINER" \
  || fail "Container '$CONTAINER' não está rodando. Execute: ssh $SSH_HOST 'cd /home/fsociety/assistant && docker compose up -d'"
ok "Container $CONTAINER rodando"

# Copiar para dentro do container
ssh $SSH_OPTS "$SSH_HOST" "docker exec $CONTAINER rm -rf /tmp/workflows && docker exec $CONTAINER mkdir -p /tmp/workflows"
for f in "$WORKFLOWS_DIR"/*.json; do
  fname=$(basename "$f")
  ssh $SSH_OPTS "$SSH_HOST" "docker cp $REMOTE_TMP/$fname $CONTAINER:/tmp/workflows/"
done
ok "Arquivos copiados para dentro do container"

# Importar cada workflow
WORKFLOW_FILES=$(ls "$WORKFLOWS_DIR"/*.json)
for f in $WORKFLOW_FILES; do
  fname=$(basename "$f")
  wf_name=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$f','utf8')).name)")
  ssh $SSH_OPTS "$SSH_HOST" "docker exec $CONTAINER n8n import:workflow --input=/tmp/workflows/$fname" > /dev/null 2>&1 \
    || fail "Falha ao importar $fname"
  ok "$wf_name ($fname)"
done

# ---------------------------------------------------------------------------
# 6. Activate — Ativar todos os workflows
# ---------------------------------------------------------------------------
step "Activate — Ativando workflows"

for f in $WORKFLOW_FILES; do
  wf_id=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$f','utf8')).id)")
  wf_name=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$f','utf8')).name)")
  ssh $SSH_OPTS "$SSH_HOST" "docker exec $CONTAINER n8n update:workflow --id=$wf_id --active=true" > /dev/null 2>&1 \
    || fail "Falha ao ativar $wf_name ($wf_id)"
  ok "$wf_name ($wf_id)"
done

# ---------------------------------------------------------------------------
# 7. Restart
# ---------------------------------------------------------------------------
step "Restart — Reiniciando container n8n"

ssh $SSH_OPTS "$SSH_HOST" "docker restart $CONTAINER" > /dev/null 2>&1
ok "Container reiniciado"
info "Aguardando n8n iniciar..."
sleep 12

# Verificar que voltou
ssh $SSH_OPTS "$SSH_HOST" "docker ps --filter name=$CONTAINER --format '{{.Status}}'" | grep -q "Up" \
  || fail "Container não voltou após restart. Verifique: ssh $SSH_HOST 'docker logs $CONTAINER --tail 30'"
ok "Container rodando"

# ---------------------------------------------------------------------------
# 8. Verify
# ---------------------------------------------------------------------------
step "Verify — Confirmando workflows no servidor"

REMOTE_LIST=$(ssh $SSH_OPTS "$SSH_HOST" "docker exec $CONTAINER n8n list:workflow" 2>&1)
EXPECTED_COUNT=$(echo "$WORKFLOW_FILES" | wc -w)
FOUND_COUNT=$(echo "$REMOTE_LIST" | grep -c "info" || true)

for f in $WORKFLOW_FILES; do
  wf_id=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$f','utf8')).id)")
  wf_name=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$f','utf8')).name)")
  if echo "$REMOTE_LIST" | grep -q "$wf_id"; then
    ok "$wf_name ($wf_id)"
  else
    fail "$wf_name ($wf_id) NÃO encontrado no servidor!"
  fi
done

# ---------------------------------------------------------------------------
# Limpar temp no servidor
# ---------------------------------------------------------------------------
ssh $SSH_OPTS "$SSH_HOST" "rm -rf $REMOTE_TMP" > /dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# Sucesso!
# ---------------------------------------------------------------------------
echo ""
echo "============================================"
echo -e "${GREEN}${BOLD}✔ Deploy completo com sucesso!${NC}"
echo -e "  Workflows: ${BOLD}$EXPECTED_COUNT${NC} importados e ativos"
echo -e "  Servidor:  ${BOLD}https://debian.taild825f5.ts.net${NC}"
echo "============================================"
