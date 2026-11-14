/**
 * Ambient declarations for the client bundle's lightningcss stylesheet
 * channels. `*.module.css` yields a hashed class map; a side-effect `.css`
 * import is compiled and injected by the shared clientBundle preset.
 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css'

declare module '*.css?inline' {
  const css: string
  export default css
}
