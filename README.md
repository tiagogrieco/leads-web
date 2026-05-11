# Leads BR — Seenup Digital

Plataforma de prospeccao baseada no dump publico de CNPJ da Receita Federal.

## Stack
- **Postgres** (EasyPanel `controlcenter/leads-db`) — base RF importada
- **API** Node.js + Fastify + pg (porta 3000)
- **Web** React + Vite + Tailwind (Nginx)
- **Deploy** EasyPanel → `leads.seenupdigital.com`

## Estrutura
```
api/    backend Fastify
web/    frontend Vite
```

## Dev local
```bash
# Backend
cd api
npm install
DATABASE_URL=postgresql://postgres:SENHA@localhost:15432/controlcenter npm run dev

# Frontend (em outro terminal)
cd web
npm install
npm run dev
# abre http://localhost:5190
```

## Filtros suportados (GET /search)
- `uf` — UF (ex: GO)
- `municipio_cod` — codigo RF municipio
- `cnae_prefix` — prefixo CNAE (ex: 47, 9602)
- `cnae` — CNAE exato
- `porte` — CSV: `EPP,DEMAIS`
- `q` — busca razao social/fantasia
- `has_phone=true` / `has_email=true`
- `page`, `per`
