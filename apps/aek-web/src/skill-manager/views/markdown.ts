/**
 * The light markdown renderer (moved from the BG round's panel): escape-
 * first, then headings / bold / inline code / fenced blocks / lists / links.
 * No external library (the console's stack is fixed), no CodeMirror
 * (user ruling: light rendering only).
 */

/** @param source - the raw markdown. */
export function renderMarkdownLite(source: string): string {
  const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string): string => {
    let out = escape(s)
    out = out.replace(/`([^`]+)`/g, '<code class="rounded-sm bg-secondary px-1 text-xs">$1</code>')
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-primary underline">$1</a>')
    return out
  }
  const lines = source.split('\n')
  const out: string[] = []
  let inCode = false
  let listOpen = false
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (listOpen) { out.push('</ul>'); listOpen = false }
      out.push(inCode ? '</code></pre>' : '<pre class="overflow-auto rounded-md bg-secondary p-2 text-xs"><code class="text-foreground">')
      inCode = !inCode
      continue
    }
    if (inCode) {
      out.push(escape(line))
      continue
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      if (listOpen) { out.push('</ul>'); listOpen = false }
      const level = heading[1].length === 1 ? 1 : heading[1].length === 2 ? 2 : 3
      const cls = level === 1 ? 'mt-4 mb-2 text-lg font-bold' : level === 2 ? 'mt-3 mb-1.5 text-base font-bold' : 'mt-3 mb-1 text-sm font-bold'
      out.push(`<h${level} class="${cls}">${inline(heading[2])}</h${level}>`)
      continue
    }
    const listItem = line.match(/^\s*[-*]\s+(.*)$/)
    if (listItem) {
      if (!listOpen) { out.push('<ul class="my-2 list-disc pl-5">'); listOpen = true }
      out.push(`<li>${inline(listItem[1])}</li>`)
      continue
    }
    if (listOpen) { out.push('</ul>'); listOpen = false }
    if (line.trim() === '') {
      out.push('')
      continue
    }
    out.push(`<p class="my-1.5 text-sm leading-6">${inline(line)}</p>`)
  }
  if (listOpen) out.push('</ul>')
  if (inCode) out.push('</code></pre>')
  return out.join('\n')
}
