/**
 * Side-effect CSS imports (Tailwind entry) — the module css type
 * declarations lived in the deleted `css-modules.d.ts`; only the plain
 * `*.css` side-effect form remains (no CSS Modules in the FF stack).
 */
declare module '*.css' {
  const classes: string
  export default classes
}
