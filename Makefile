# =============================================================================
# Makefile — Interface única para o projeto n8n Personal Assistant
#
# USO RÁPIDO:
#   make help     — Ver todos os comandos disponíveis
#   make deploy   — Pipeline completo (build → lint → test → upload → import → restart)
#   make test     — Testar formatação localmente (sem deployar)
#   make status   — Ver estado do servidor e workflows
#   make logs     — Ver logs do n8n no servidor
#
# REGRA DE OURO: nunca edite os JSONs em workflows/ diretamente.
# Edite os .js em scripts/nodes/ e rode "make build".
# =============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help

-include .env

# Configuração
SSH_HOST    := $(DEPLOY_SSH_HOST)
SSH_OPTS    := $(DEPLOY_SSH_OPTS)
CONTAINER   := $(N8N_CONTAINER_NAME)
SCRIPTS     := scripts

# Cores
BLUE  := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
BOLD  := \033[1m
NC    := \033[0m

# =============================================================================
# COMANDOS PRINCIPAIS
# =============================================================================

.PHONY: help
help: ## Mostrar todos os comandos disponíveis
	@echo ""
	@echo -e "$(BOLD)📋 Comandos disponíveis:$(NC)"
	@echo ""
	@echo -e "$(BLUE)  Desenvolvimento:$(NC)"
	@echo "    make build        Gerar JSONs a partir dos scripts JS em scripts/nodes/"
	@echo "    make lint         Validar padrões de qualidade nos workflows"
	@echo "    make test         Testar formatação com dados mock (roda local)"
	@echo "    make check        Rodar build + lint + test (sem deployar)"
	@echo ""
	@echo -e "$(BLUE)  Deploy:$(NC)"
	@echo "    make deploy       Pipeline completo: build → lint → test → upload → restart"
	@echo "    make deploy-fast  Deploy sem testes (emergência)"
	@echo "    make dry-run      Simular deploy sem enviar ao servidor"
	@echo ""
	@echo -e "$(BLUE)  Servidor:$(NC)"
	@echo "    make status       Ver estado do container e workflows ativos"
	@echo "    make logs         Ver últimas 50 linhas de log do n8n"
	@echo "    make logs-follow  Seguir logs em tempo real (Ctrl+C para sair)"
	@echo "    make restart      Reiniciar container n8n"
	@echo "    make export       Baixar workflows atuais do servidor para local"
	@echo "    make ssh          Abrir sessão SSH no servidor"
	@echo ""
	@echo -e "$(YELLOW)  Dica: edite os .js em scripts/nodes/ e rode 'make deploy'$(NC)"
	@echo ""

# =============================================================================
# DESENVOLVIMENTO
# =============================================================================

.PHONY: build
build: ## Gerar JSONs a partir dos scripts JS
	@echo -e "$(BLUE)$(BOLD)Building workflows...$(NC)"
	@node $(SCRIPTS)/build-workflows.js

.PHONY: lint
lint: ## Validar padrões de qualidade
	@echo -e "$(BLUE)$(BOLD)Linting workflows...$(NC)"
	@node $(SCRIPTS)/lint-workflows.js

.PHONY: test
test: ## Testar formatação com dados mock
	@echo -e "$(BLUE)$(BOLD)Testing message formatting...$(NC)"
	@node $(SCRIPTS)/test-messages.js

.PHONY: check
check: build lint test ## Build + lint + test (sem deployar)
	@echo ""
	@echo -e "$(GREEN)$(BOLD)✔ Tudo OK — pronto para deploy$(NC)"

# =============================================================================
# DEPLOY
# =============================================================================

.PHONY: deploy
deploy: ## Pipeline completo de deploy
	@bash $(SCRIPTS)/deploy.sh

.PHONY: deploy-fast
deploy-fast: ## Deploy sem testes (emergência)
	@bash $(SCRIPTS)/deploy.sh --skip-tests

.PHONY: dry-run
dry-run: ## Simular deploy localmente
	@bash $(SCRIPTS)/deploy.sh --dry-run

# =============================================================================
# SERVIDOR
# =============================================================================

.PHONY: status
status: ## Ver estado do container e workflows
	@echo -e "$(BLUE)$(BOLD)Estado do servidor:$(NC)"
	@echo ""
	@echo -e "$(BOLD)Container:$(NC)"
	@ssh $(SSH_OPTS) $(SSH_HOST) "docker ps --filter name=$(CONTAINER) --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'" 2>/dev/null \
		|| echo "  Erro: não foi possível conectar ao servidor"
	@echo ""
	@echo -e "$(BOLD)Workflows:$(NC)"
	@ssh $(SSH_OPTS) $(SSH_HOST) "docker exec $(CONTAINER) n8n list:workflow 2>/dev/null" 2>/dev/null \
		| grep "info" | sed 's/.*info  | /  /' \
		|| echo "  Erro: não foi possível listar workflows"
	@echo ""

.PHONY: logs
logs: ## Ver últimas 50 linhas de log
	@ssh $(SSH_OPTS) $(SSH_HOST) "docker logs $(CONTAINER) --tail 50" 2>&1

.PHONY: logs-follow
logs-follow: ## Seguir logs em tempo real
	@ssh $(SSH_OPTS) $(SSH_HOST) "docker logs $(CONTAINER) --tail 20 -f" 2>&1

.PHONY: restart
restart: ## Reiniciar container n8n
	@echo -e "$(YELLOW)Reiniciando n8n...$(NC)"
	@ssh $(SSH_OPTS) $(SSH_HOST) "docker restart $(CONTAINER)"
	@echo -e "$(GREEN)✔ Container reiniciado$(NC)"

.PHONY: export
export: ## Baixar workflows atuais do servidor
	@echo -e "$(BLUE)$(BOLD)Exportando workflows do servidor...$(NC)"
	@ssh $(SSH_OPTS) $(SSH_HOST) "\
		docker exec $(CONTAINER) rm -rf /tmp/export && \
		docker exec $(CONTAINER) mkdir -p /tmp/export && \
		docker exec $(CONTAINER) n8n export:workflow --all --output=/tmp/export/ && \
		docker cp $(CONTAINER):/tmp/export /tmp/n8n-export" 2>/dev/null
	@mkdir -p /tmp/n8n-export-local
	@scp -q $(SSH_HOST):/tmp/n8n-export/* /tmp/n8n-export-local/ 2>/dev/null
	@echo -e "$(GREEN)✔ Workflows exportados para /tmp/n8n-export-local/$(NC)"
	@ls -la /tmp/n8n-export-local/

.PHONY: ssh
ssh: ## Abrir sessão SSH no servidor
	@ssh $(SSH_OPTS) $(SSH_HOST)
