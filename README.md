# n8n Server Assistant

Assistente pessoal self-hosted em n8n, com interface principal via Telegram.

Integra:
- Google Calendar
- Google Classroom
- Moodle UTFPR
- Portal do Aluno UTFPR (horario e faltas)
- OpenRouter (perguntas gerais)

## Visao Geral

Fluxo principal:

```text
Telegram -> Main Router -> Sub-workflows
```

Roteamento do bot:
- `/briefing` -> `Daily Briefing`
- `/calendar` ou `/calendario` -> `Calendar Sync`
- `/aulas` ou `/horario` -> `Aulas Sync`
- `/moodle` -> `Moodle Sync`
- `/classroom` -> `Classroom Sync`
- qualquer outra mensagem -> `General QA`

O workflow `Daily Briefing` tambem possui um `Cron` diario as 07:00 (timezone configurada no `.env`).

## Workflows Versionados

| Arquivo | Nome no n8n | ID |
|---|---|---|
| `workflows/main-router.json` | Main Router | `SvKKVIGPCc68OOyL` |
| `workflows/daily-briefing.json` | Daily Briefing | `KZPDjrKOkeo5VEgr` |
| `workflows/calendar-sync.json` | Calendar Sync | `calendarSync2468` |
| `workflows/aulas-sync.json` | Aulas Sync | `aulasSync24680` |
| `workflows/moodle-sync.json` | Moodle Sync | `moodleSync123456` |
| `workflows/classroom-sync.json` | Classroom Sync | `classroomSync789` |
| `workflows/general-qa.json` | General QA | `qaPatch429` |

## Estrutura Do Repositorio

```text
.
├── docker-compose.yml
├── .env.example
├── credentials/
│   ├── google-calendar.json
│   ├── google-classroom.json
│   └── telegram.json
├── scripts/
│   ├── build-workflows.js
│   ├── lint-workflows.js
│   ├── test-messages.js
│   ├── deploy.sh
│   └── nodes/
└── workflows/
```

Arquivos importantes:
- `scripts/nodes/*.js`: codigo-fonte real dos Code nodes
- `scripts/build-workflows.js`: injeta `scripts/nodes/*.js` nos JSONs de `workflows/`
- `scripts/lint-workflows.js`: valida padroes de qualidade dos workflows
- `scripts/test-messages.js`: testa escape/sanitizacao Markdown para Telegram
- `scripts/deploy.sh`: pipeline de deploy remoto (build -> lint -> test -> upload -> import -> ativacao -> restart)

## Pre-Requisitos

- Docker + Docker Compose
- Node.js 18+
- GNU Make
- SSH/SCP (apenas para deploy remoto)

## Setup Rapido (Local)

1. Copie o arquivo de ambiente:

```bash
cp .env.example .env
```

2. Preencha o `.env` com os valores necessarios.

3. Suba os servicos:

```bash
docker compose up -d
```

4. Acesse o n8n em `http://localhost:5678` e conclua o onboarding inicial.

5. Importe os workflows da pasta `workflows/` no n8n.

6. Crie/importe credenciais no n8n com os mesmos nomes usados pelos workflows:
- `Telegram account` (`telegramApi`)
- `Google Calendar account` (`googleCalendarOAuth2Api`)
- `Google Classroom` (`googleOAuth2Api`)

Observacao:
- Os arquivos em `credentials/` sao templates para facilitar padronizacao de nome/tipo.
- Nunca comite segredos reais no repositorio.

## Variaveis De Ambiente Essenciais

As principais estao em `.env.example`.

Blocos mais importantes:
- `N8N_HOST`, `N8N_PROTOCOL`, `N8N_ENCRYPTION_KEY`, `GENERIC_TIMEZONE`, `TZ`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`
- `MOODLE_URL`, `MOODLE_TOKEN`
- `CLASSROOM_API_BASE_URL`
- `UTFPR_PORTAL_BASE_URL`, `UTFPR_PORTAL_USERNAME`, `UTFPR_PORTAL_PASSWORD`
- `UTFPR_COD_ALUNO` (opcional)
- `UTFPR_PREP_MINUTES`, `UTFPR_COMMUTE_MINUTES` (opcionais)

Para deploy remoto:
- `DEPLOY_SSH_HOST`
- `DEPLOY_SSH_OPTS`
- `DEPLOY_REMOTE_TMP`
- `N8N_CONTAINER_NAME`

Variaveis reservadas/futuras no `.env.example` (nao obrigatorias para o fluxo atual):
- `N8N_USER`, `N8N_PASS`
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_NOTES_GROUP_ID`
- `GOOGLE_SHEETS_FINANCE_ID`, `GOOGLE_SHEETS_NOTES_ID`

Variaveis de Google OAuth (`GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`) sao usadas para configurar as credenciais OAuth no n8n.

## Comandos De Desenvolvimento

Use `make help` para listar tudo.

Fluxo recomendado:

```bash
make build   # gera/atualiza workflows/*.json a partir de scripts/nodes/*.js
make lint    # valida padroes dos workflows
make test    # testa mensagens Telegram com mocks
make check   # build + lint + test
```

Regra pratica:
- Nao edite `workflows/*.json` manualmente para alterar logica de Code nodes.
- Edite `scripts/nodes/*.js` e rode `make build`.

## Deploy

Pipeline completo:

```bash
make deploy
```

Outras opcoes:

```bash
make dry-run     # valida localmente sem enviar ao servidor
make deploy-fast # deploy sem testes (emergencia)
make status
make logs
make restart
```

O deploy importa os workflows no container n8n, ativa todos e reinicia o servico.

## Troubleshooting Rapido

- Bot nao responde no Telegram:
    confira `TELEGRAM_CHAT_ID` e se a mensagem veio do chat permitido.

- Erro de Markdown no Telegram:
    rode `make test` e `make lint` para validar escape/sanitizacao.

- Router nao chama sub-workflow certo:
    rode `make build` e confirme IDs em `scripts/nodes/router-main.js`.

- Workflows desatualizados no n8n:
    rode `make deploy` (ou reimporte `workflows/*.json` manualmente).

## Licenca

MIT. Veja o arquivo `LICENSE`.
