# Centavo · Finanzas personales y familiares

PWA (React + Vite + Tailwind) sobre Supabase. Cada usuario ve solo sus finanzas; con contactos se comparten gastos y préstamos.

## Módulos
- Captura rápida de gastos, ingresos y transferencias (botón +)
- Tarjetas de crédito: corte, fecha límite, pago para no generar intereses, MSI
- Presupuesto mensual por categoría
- Préstamos y créditos con tasa, plazo, amortización y abonos
- Compartidos: contactos por correo, gastos divididos, préstamos compartidos

## Base de datos
Proyecto Supabase **Personal** (`ovaosvzahfkvdaukgbrf`). Todas las tablas usan prefijo `centavo_`. Esquema en `supabase/schema.sql`.

## Desarrollo
```bash
npm install
npm run dev
```
Variables (`.env.production` ya incluido; la llave es la publicable de Supabase, segura en el navegador):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_KEY=sb_publishable_...
```

## Despliegue
Vercel: importar el repo, framework **Vite**, build `npm run build`, salida `dist`.
