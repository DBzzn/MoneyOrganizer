# 💰 Money Organizer

> Aplicação web de gestão financeira pessoal — controle de receitas, despesas, parcelamentos e relatórios com projeção futura.

![Stack](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![Stack](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Stack](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Stack](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Stack](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![Stack](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

---

## 📋 Sumário

- [Sobre o projeto](#sobre-o-projeto)
- [Funcionalidades](#funcionalidades)
- [Stack tecnológica](#stack-tecnológica)
- [Arquitetura](#arquitetura)
- [Como rodar localmente](#como-rodar-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Endpoints da API](#endpoints-da-api)
- [Decisões técnicas](#decisões-técnicas)
- [Roadmap](#roadmap)

---

## Sobre o projeto

Money Organizer nasceu  inicialmente como uma necessidade minha de parar de usar planilhas de Excel e GSheets que eu criava e utilizava, posteriormente acabou surgindo a ideia de usar como um projeto de portfólio para aprender TypeScript, NestJS e React na prática — resolvendo um problema real com uma stack moderna e tomando decisões de arquitetura ao longo do desenvolvimento.

O sistema permite que cada usuário registre suas transações financeiras, organize por categorias, visualize a evolução do período em gráficos e projete o futuro com base em transações pendentes e parcelamentos.


---

## Funcionalidades

### ✅ Implementadas
- **Autenticação completa** — registro, login com JWT, proteção de rotas
- **Categorias** — CRUD completo com ícone emoji, categorias padrão criadas no registro
- **Transações** — CRUD com tipo (receita, débito, crédito, pix, dinheiro), valor, data, categoria e status de pendência
- **Parcelamentos** — criação automática de N parcelas com distribuição correta de centavos
- **Dashboard** — cards de resumo + gráfico de evolução (6 meses) + pizza por categoria
- **Relatórios** — balanço mensal, evolução por período e projeção futura
- **Tema escuro** — toggle com persistência no localStorage e preview de cor no hover
- **Documentação automática** — Swagger/OpenAPI disponível em `/api`

### ⏳ Em desenvolvimento
- Toast notifications
- Modal de confirmação de exclusão
- Filtro por mês na tabela de transações
- Responsividade mobile
- Saldo acumulado no período
- Paginação

---

## Stack tecnológica

### Backend
| Tecnologia | Versão | Uso |
|---|---|---|
| NestJS | Latest | Framework principal |
| TypeScript | Latest | Linguagem |
| Prisma ORM | v7 | ORM com adapter pg |
| PostgreSQL | 15 | Banco de dados (Docker) |
| JWT + Passport | - | Autenticação |
| bcrypt | - | Hash de senhas |
| class-validator | - | Validação de DTOs |
| Swagger/OpenAPI | - | Documentação automática |

### Frontend
| Tecnologia | Versão | Uso |
|---|---|---|
| React | 18 | Framework UI |
| TypeScript | Latest | Linguagem |
| Vite | Latest | Build tool |
| Tailwind CSS | v4 | Estilização |
| React Router DOM | - | Roteamento |
| Axios | - | HTTP client + interceptor JWT |
| React Hook Form + Zod | - | Formulários e validação |
| Recharts | - | Gráficos interativos |
| Lucide React | - | Ícones |

### Infraestrutura
| Ferramenta | Uso |
|---|---|
| Docker + docker-compose | PostgreSQL + pgAdmin |
| pgAdmin | Interface visual do banco |

---

## Arquitetura

### Backend — princípios de segurança
- Todo recurso tem `userId` obrigatório — cada dado tem dono
- `findAll` sempre filtra por `userId` — nunca vaza dados entre usuários
- Ownership verificado com `where` duplo no Prisma (`id + userId`) — elimina query extra
- Falha de ownership retorna **404** (não 403) — não vaza existência do recurso (proteção IDOR)
- `amount` como `Decimal(10,2)` — nunca `Float` para valores monetários
- Mensagem genérica no login — não diferencia "e-mail não existe" de "senha errada"

### Parcelamentos
- Cada parcela é uma `Transaction` individual, linkada por `installmentGroupId` (UUID)
- Campos de parcelamento são **imutáveis** após criação
- Distribuição correta de centavos: última parcela recebe o ajuste para garantir total exato
- Criação usa `$transaction()` do Prisma para atomicidade

### Frontend — padrões
- Contextos separados dos Providers e Hooks (compatibilidade com fast refresh do Vite)
- `ThemeProvider` externo ao `AuthProvider` — tema afeta até telas sem autenticação
- `useState` com lazy init no `ThemeProvider` — evita flash de tema errado no reload
- `parseLocalDate()` no backend e `toInputDate()` no frontend — eliminam bug de timezone do `Date`
- Tema escuro via CSS custom properties (`--color-bg`, `--color-text`, etc.) — sem Tailwind dark mode

---

## Como rodar localmente

### Pré-requisitos
- Node.js 18+
- Docker Desktop
- Git

### 1. Clone o repositório
```bash
git clone https://github.com/DBzzn/money-organizer.git
cd money-organizer
```

### 2. Suba o banco de dados
```bash
cd money-organizer-api
docker-compose up -d
```

> pgAdmin disponível em http://localhost:5050 (admin@admin.com / admin)

### 3. Configure o backend
```bash
cd money-organizer-api
npm install
cp .env.example .env
# Edite o .env com suas configurações
npx prisma migrate dev
npx prisma generate
npm run start:dev
```

> API disponível em http://localhost:3000  
> Swagger em http://localhost:3000/api

### 4. Configure o frontend
```bash
cd money-organizer-web
npm install
cp .env.example .env
npm run dev
```

> Frontend disponível em http://localhost:5173

---

## Variáveis de ambiente

### Backend (`money-organizer-api/.env`)
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/moneyorganizer"
JWT_SECRET=sua_chave_secreta_aqui
```

### Frontend (`money-organizer-web/.env`)
```env
VITE_API_URL=http://localhost:3000
```

---

## Endpoints da API

### Auth
| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| POST | `/auth/register` | Cria usuário + categorias padrão | ❌ |
| POST | `/auth/login` | Retorna JWT | ❌ |
| GET | `/auth/me` | Dados do usuário logado | ✅ |

### Categories
| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/categories` | Lista categorias do usuário | ✅ |
| POST | `/categories` | Cria categoria | ✅ |
| PATCH | `/categories/:id` | Atualiza categoria | ✅ |
| DELETE | `/categories/:id` | Remove categoria | ✅ |

### Transactions
| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/transactions` | Lista com filtros | ✅ |
| POST | `/transactions` | Cria transação | ✅ |
| GET | `/transactions/:id` | Busca transação | ✅ |
| PATCH | `/transactions/:id` | Atualiza transação | ✅ |
| DELETE | `/transactions/:id` | Remove transação | ✅ |
| POST | `/transactions/installments` | Cria parcelamento | ✅ |
| GET | `/transactions/totals/by-category` | Totais por categoria | ✅ |

### Reports
| Método | Endpoint | Params | Auth |
|---|---|---|---|
| GET | `/transactions/reports/monthly-balance` | `?month=YYYY-MM` | ✅ |
| GET | `/transactions/reports/evolution` | `?startMonth=YYYY-MM&endMonth=YYYY-MM` | ✅ |
| GET | `/transactions/reports/projection` | `?startMonth=YYYY-MM&endMonth=YYYY-MM` | ✅ |

> Documentação interativa completa em http://localhost:3000/api

---

## Decisões técnicas

### Por que NestJS?
Arquitetura modular, injeção de dependência nativa, decorators para validação e documentação — produtividade sem abrir mão de organização em projetos que crescem.

### Por que Prisma v7?
ORM type-safe com migrations automáticas e queries parametrizadas (proteção automática contra SQL injection). O adapter `@prisma/adapter-pg` é obrigatório no v7.

### Por que Tailwind CSS v4?
V4 usa plugin do Vite sem `tailwind.config.js` e importação direta via `@import "tailwindcss"` no CSS. Tema escuro implementado com CSS custom properties para maior flexibilidade.

### Por que `Decimal` e não `Float` para valores monetários?
`Float` tem imprecisão de ponto flutuante — R$10,00 pode virar R$9,9999999. `Decimal(10,2)` garante precisão exata.

### Por que 404 e não 403 para recursos de outros usuários?
403 confirmaria que o recurso existe mas o usuário não tem acesso — o que é uma vulnerabilidade (IDOR). 404 não vaza essa informação.

---

## Roadmap

- [x] Autenticação JWT
- [x] CRUD de categorias
- [x] CRUD de transações
- [x] Parcelamentos automáticos
- [x] Dashboard com gráficos
- [x] Relatórios e projeção
- [x] Tema escuro
- [ ] Saudação dinâmica na Sidebar
- [ ] Toast notifications
- [ ] Modal de confirmação de exclusão
- [ ] Filtro por mês nas transações
- [ ] Limite de campos
- [ ] Responsividade mobile
- [ ] Saldo acumulado no período
- [ ] Paginação
- [ ] Deploy (Railway + Vercel)
- [ ] Metas financeiras
- [ ] Exportar relatório em PDF
- [ ] Recorrência automática de transações

---

## Autor

Desenvolvido como projeto de portfólio.  
Feito com 💙 usando NestJS, React e TypeScript.
