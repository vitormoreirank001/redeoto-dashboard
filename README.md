# Brasa — CRM comercial via WhatsApp

Painel administrativo (CRM/funil comercial) com o princípio de nunca deixar um lead esfriar sem resposta. Nasceu sob medida para a clínica odontológica **Rede Otto** (projeto VMP — Venda Mais com Processo) e está em reforma de identidade/UX (V5.0) para virar produto white-label. Cobre captação de leads, funil de vendas (Kanban), agenda, financeiro, estoque e estatísticas.

## Stack

| Camada | Tecnologia |
|---|---|
| Linguagem | TypeScript |
| Framework | [TanStack Start](https://tanstack.com/start) (SSR) + React 19 |
| Build/dev server | Vite 7 |
| Roteamento | TanStack Router (file-based, `src/routes`) |
| Dados/cache | TanStack Query 5 |
| Estilo | Tailwind CSS v4 + shadcn/ui (Radix UI) |
| Formulários | react-hook-form + zod |
| Gráficos | Recharts |
| Drag-and-drop | dnd-kit (Kanban do CRM, com suporte a touch) |
| Backend | [Supabase](https://supabase.com) — Postgres, Auth, Storage, Edge Functions |
| Lint/format | ESLint + Prettier |

Não há modelo de IA integrado no momento — é um CRM tradicional (Postgres + REST via Supabase). Conversar com IA no WhatsApp é uma ideia em avaliação, ainda não construída.

## Estrutura

```
src/
  routes/_authenticated/   # uma rota por tela: dashboard, crm, agendamento,
                            # financeiro (admin), estoque, estatisticas (admin),
                            # chat, configuracoes (admin)
  components/               # componentes de UI compartilhados (shadcn/ui + custom)
  hooks/                    # use-leads, use-user-role, use-overdue-notifications...
  lib/                      # date-ranges, lead-sla, utils
  integrations/supabase/    # client Supabase + tipos gerados do schema
supabase/
  migrations/                # histórico de migrations SQL (versionado, aplicado manualmente)
  functions/
    admin-create-user/       # Edge Function: cria usuário validando que quem chama é admin
    whatsapp-webhook/         # Edge Function: recebe eventos brutos do WhatsApp
```

## Autenticação e papéis

Login por e-mail/senha (Supabase Auth), **sem cadastro público** — usuários só são criados pelo admin (via `admin-create-user`). Dois papéis (`app_role`): `admin` (acesso total, inclui Financeiro/Estatísticas/Configurações) e `comercial` (acesso operacional, sem essas três telas).

## Rodando localmente

Pré-requisitos: Node 20+ (testado com v24) e `npm`.

```bash
npm install
npm run dev       # http://localhost:8080
npm run build      # build de produção
npm run lint        # ESLint
npm run format      # Prettier
```

### Variáveis de ambiente (`.env`)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

São as chaves **públicas** do projeto Supabase (anon/publishable) — seguras para ficar no repositório, protegidas por Row Level Security no banco. **Nunca** commitar a `service_role`/secret key.

## Deploy

Deploy automático via [Lovable](https://lovable.dev) a cada push na branch `main`. Não há pipeline de CI separado — `npm run lint` e `tsc --noEmit` devem ser rodados manualmente antes de subir mudanças.

## Banco de dados (Supabase)

Migrations em `supabase/migrations/`, aplicadas manualmente pelo SQL Editor do Supabase (ou via Management API com um Personal Access Token) — não há `supabase db push` automatizado neste fluxo. Tabelas principais: `leads`, `monthly_goals`, `expenses`, `services`, `profiles`, `user_roles`, `app_settings`, `inventory_items`, `daily_calls`, `custom_fields`, `field_options`, `whatsapp_events`.

Row Level Security (RLS) ativo em todas as tabelas — leitura de `leads` exige usuário autenticado (não há acesso anônimo).
