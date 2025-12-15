# POS Monorepo (Node.js + MongoDB)

## Quick start (local)
```bash
cp .env.example .env
npm i
npm run dev:api   # terminal 1
npm --workspace apps/api run seed
npm run dev:web   # terminal 2
```
API: http://localhost:4000  |  Web: http://localhost:3000

## Docker services (optional)
```bash
docker compose up -d mongo redis mongo-express
```
