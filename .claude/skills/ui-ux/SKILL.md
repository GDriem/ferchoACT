---
name: ui-ux
description: Reglas de UI/UX del portal de facturas para el contador (Next.js + Tailwind + shadcn/ui). Usar antes de crear o modificar cualquier pantalla, componente, formulario, tabla o flujo de cámara/escaneo.
---

# UI/UX del portal de facturas

Hay dos públicos con necesidades opuestas. Diseñar cada pantalla pensando en cuál de los dos la usa.

| Público | Dispositivo | Tarea principal | Prioridad |
|---|---|---|---|
| Cliente (miembro de empresa) | Celular, una mano, a veces en la calle | Escanear y subir una factura en < 30 s | Rapidez, pocos toques |
| Contador | Escritorio, pantalla grande | Revisar decenas de facturas por empresa/mes y generar el reporte SAR | Densidad de datos, teclado, filtros |

## Stack de UI

- Tailwind CSS + componentes de shadcn/ui (`components/ui/`). No usar otra librería de componentes.
- Iconos: `lucide-react`.
- Formularios: `react-hook-form` + `zod`, y el **mismo esquema zod** que valida el servidor (importado de `lib/validation/`).
- Tablas del contador: `@tanstack/react-table` sobre el `<Table>` de shadcn.
- Notificaciones: `sonner` (toast) solo para confirmar acciones. Los errores de un formulario se muestran junto al campo, no en un toast.

## Idioma y formatos (Honduras)

- Todo el texto de la interfaz en español de Honduras, con "usted" y lenguaje simple ("Subir factura", no "Ingestar documento").
- Moneda: `new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL' })` → `L 1,234.56`. Montos alineados a la derecha y con `tabular-nums` en las tablas.
- Fechas: `dd/MM/yyyy` y zona horaria `America/Tegucigalpa`. Los períodos se muestran como "Octubre 2026".
- RTN: mostrarlo con formato `0801-1990-123456` pero guardarlo sin guiones (14 dígitos).
- Número de factura: `000-001-01-00000123` (establecimiento-punto de emisión-tipo de documento-correlativo).
- Toda la copy va centralizada en el componente o en `lib/copy.ts`. No inventar términos fiscales: usar los del SAR (CAI, RTN, ISV, rango autorizado, fecha límite de emisión, importe exento, importe exonerado, importe gravado 15 % / 18 %).

## Flujo de escaneo (móvil, lo más importante)

1. Un botón principal grande y fijo abajo: **"Escanear factura"**, siempre visible en el inicio del cliente.
2. Para capturar, primero `<input type="file" accept="image/*,application/pdf" capture="environment">`, que funciona igual en iOS y Android. Un visor propio con `getUserMedia` (guía de bordes) es una mejora opcional que no debe reemplazar al input.
3. Antes de subir, comprimir la imagen en el cliente (lado mayor ≤ 2000 px, JPEG con calidad ~0.85) y mostrar una vista previa con las opciones "Repetir" y "Usar foto".
4. Subir y mostrar el progreso real. Mientras corre el OCR el usuario puede salir, porque la factura queda como "Procesando" en su lista.
5. Pantalla de confirmación: los campos vienen prellenados por el OCR, y cada campo con confianza baja (< 0.8) se resalta en ámbar con el texto "Verifique este dato". Montos y RTN usan `inputMode="decimal"` / `inputMode="numeric"`.
6. Validar en vivo: que el ISV cuadre con lo gravado (15 % / 18 %), que subtotal + ISV = total (con tolerancia de L 0.05), el formato de CAI y RTN, y que la fecha de emisión no sea posterior a la fecha límite del CAI.
7. Al guardar, mostrar un éxito claro y la acción "Escanear otra".

## Vistas del contador (escritorio)

- Navegación: Empresa → Período (mes) → Facturas. El selector de empresa y de mes debe estar siempre visible y quedar reflejado en la URL (`/contador/[empresaId]/[yyyy-mm]`), para poder compartir el enlace o volver con el botón atrás.
- La tabla tiene columnas fijas: fecha, proveedor, RTN, N.º factura, gravado, ISV, total, estado y quién la subió. Debe permitir ordenar, filtrar por estado y buscar por RTN o número.
- Arriba van tarjetas con los totales del mes (gravado 15 %, gravado 18 %, exento, ISV total, cantidad de facturas pendientes de revisar).
- Al hacer clic en una fila se abre un panel lateral (`Sheet`) con la imagen original a la izquierda y los datos a la derecha, para comparar y corregir sin cambiar de página.
- Las acciones por lote (marcar como revisadas, mover de período) se hacen con checkboxes en la tabla.
- El botón "Generar reporte SAR" queda deshabilitado mientras haya facturas sin revisar en el período, y un tooltip explica el motivo.

## Estados obligatorios

Cada vista que carga datos implementa los 4 estados:
- **Cargando**: skeletons con la forma del contenido, no un spinner a pantalla completa.
- **Vacío**: un mensaje con la siguiente acción ("Aún no hay facturas en octubre. Escanear factura").
- **Error**: un mensaje entendible y el botón "Reintentar". Nunca mostrar stack traces ni mensajes crudos del servidor.
- **Con datos**.

Estados de una factura, con color y texto consistentes en toda la app:
`Procesando` (gris) · `Por revisar` (ámbar) · `Validada` (verde) · `Declarada` (azul, solo lectura) · `Rechazada` (rojo, con motivo).

## Accesibilidad y calidad

- Los objetivos táctiles miden ≥ 44×44 px y el contraste es AA. El estado nunca se comunica solo con color (siempre lleva texto o icono).
- Cada input tiene su `<Label>` asociado y los errores van enlazados con `aria-describedby`.
- Diseñar primero para móvil y revisar en 360 px de ancho. Las tablas del contador pueden tener scroll horizontal propio, pero la página no.
- Soportar modo oscuro usando los tokens de shadcn (`bg-background`, `text-muted-foreground`, …). Nada de colores hex sueltos.
- No pedir confirmación para acciones reversibles; para las destructivas usar `AlertDialog` y nombrar el objeto ("¿Eliminar la factura 000-001-01-00000123?").
