# n8n Personal Assistant

Assistente pessoal self-hosted usando n8n + Telegram + OpenRouter + Google APIs + Moodle UTFPR.

## Arquitetura

```
Telegram → Main Router → Sub-Workflows
                           ├── Daily Briefing (Google Calendar + Moodle)
                           ├── Calendar Sync (Google Calendar dedicado)
                           ├── Aulas Sync (UTFPR Portal Aluno: horario + faltas)
                           ├── Moodle Sync (UTFPR REST API)
                           ├── Classroom Sync (Google Classroom API)
                           ├── General QA (OpenRouter LLM)
                           └── (futuro: Finance, Flashcards, Notes)
```

## Workflow IDs (n8n)

| Workflow | ID |
|---|---|
| Main Router | `SvKKVIGPCc68OOyL` |
| Daily Briefing | `KZPDjrKOkeo5VEgr` |
| Calendar Sync | `calendarSync2468` |
| Aulas Sync | `aulasSync24680` |
| General QA | `qaPatch429` |
| Moodle Sync | `moodleSync123456` |
| Classroom Sync | `classroomSync789` |

## Setup

1. Copie `.env.example` para `.env` e preencha com suas credenciais
2. `docker compose up -d`
3. Configure o Tailscale Funnel: `tailscale funnel --bg 5678`
4. Acesse o n8n pelo endereço do Tailscale e crie sua conta
5. Importe os workflows da pasta `workflows/`
6. Configure as credenciais no n8n:
   - **Telegram Bot** — token do BotFather
   - **Google Calendar OAuth2** — para Daily Briefing
   - **Google Classroom OAuth2** — para Classroom Sync (precisa de scopes do Classroom API, separado do Calendar)
7. Configure tambem no `.env` as credenciais do Portal Aluno UTFPR para `/aulas` e bloco de aulas no briefing:
    - `UTFPR_PORTAL_USERNAME`
    - `UTFPR_PORTAL_PASSWORD`
    - `UTFPR_COD_ALUNO` (opcional, para fixar o curso/aluno quando houver mais de um)
    - `UTFPR_PREP_MINUTES` e `UTFPR_COMMUTE_MINUTES` (opcional, para ajustar dica de arrumar/sair)
8. Ative a Google Classroom API no Google Cloud Console do seu projeto

## Estrutura

```
├── docker-compose.yml      # Stack: n8n + Redis
├── .env.example             # Template de variáveis de ambiente
├── plano.md                 # Documentação detalhada da arquitetura
└── workflows/
    ├── main-router.json     # Router de comandos Telegram
    ├── daily-briefing.json  # Agenda diária (Google Cal + Moodle)
    ├── calendar-sync.json   # Agenda dedicada do Google Calendar
    ├── aulas-sync.json      # Horario de aulas UTFPR + faltas do boletim
    ├── general-qa.json      # QA via OpenRouter LLM
    ├── moodle-sync.json     # Entregas do Moodle UTFPR
    └── classroom-sync.json  # Tarefas do Google Classroom
```
