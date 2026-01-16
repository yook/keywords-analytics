# Vue PWA + DuckDB (Hello World)

Минимальный проект: Vue 3 + Vite + TailwindCSS + Element Plus + DuckDB (WASM) + PWA

Quick start:

```bash
cd "project"
npm install
npm run dev
```

Заметки:

- DuckDB здесь подключён через `@duckdb/duckdb-wasm` и использует WASM bundle.
- PWA настроена через `vite-plugin-pwa`.
- Если DuckDB WASM API в пакете изменился, откройте `src/components/HelloDuckDB.vue` и отредактируйте инициализацию.

## Shortcuts

press r + enter to restart the server
press u + enter to show server url
press o + enter to open in browser
press c + enter to clear console
press q + enter to quit
