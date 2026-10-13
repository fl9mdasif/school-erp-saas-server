# School Management SaaS: Server

Multi-tenant school ERP backend. Node 22, Express 5, TypeScript, MongoDB (Mongoose), Zod.

- WHAT to build: `../a-docs/school-management-prd-server.md`
- HOW to build: `../a-docs/school-management-sop-server.md`
- Progress: see `../CHECKLIST.md` and `../development-tracker.html` (project root, outside this repo)

## Setup
1. Copy `.env.example` to `.env` and fill it in.
2. `npm install`
3. `npm run dev`

Module layout: `src/app/modules/<module>/<role>.<module>.{controller,service,model,interface,route,validation}.ts`
