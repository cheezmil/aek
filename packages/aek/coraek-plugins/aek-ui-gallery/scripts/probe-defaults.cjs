#!/usr/bin/env node
// classify the default-export shape of every ported shadcnspace demo.
// Transforms each demo (and its relative imports) to CJS via esbuild and
// evaluates with stubbed bare-module require, then reports non-function
// defaults (React #130 suspects).
const esbuild = require('esbuild')
const path = require('node:path')
const fs = require('node:fs')
const { execSync } = require('node:child_process')

const root = process.cwd()
const files = execSync(
  'find src/web/ported/components/shadcn-space -name "*.tsx" -o -name "*.jsx" | sort',
  { encoding: 'utf8' },
).trim().split('\n')

const cache = new Map() // absPath -> exports

function toCJS(abs) {
  const code = fs.readFileSync(abs, 'utf8')
  const loader = abs.endsWith('.jsx') ? 'jsx' : abs.endsWith('.tsx') ? 'tsx' : abs.endsWith('.json') ? 'json' : 'ts'
  return esbuild.transformSync(code, { loader, format: 'cjs' }).code
}

function requireStub(id, from) {
  // bare or aliased: return a proxy that fabricates component-ish stubs
  if (!id.startsWith('.')) {
    // React must be the real thing for $$typeof symbol comparison
    if (id === 'react' || id === 'react-dom' || id === 'react-dom/client') {
      try { return require(id) } catch {}
    }
    return new Proxy(function Stub() {}, {
      get(t, p) {
        if (p === Symbol.toStringTag) return 'Function'
        if (typeof p === 'symbol') return undefined
        return t
      },
    })
  }
  const base = path.resolve(path.dirname(from), id)
  for (const cand of [base + '.tsx', base + '.jsx', base + '.ts', base, base + '/index.tsx']) {
    if (fs.existsSync(cand)) {
      if (cache.has(cand)) return cache.get(cand)
      const m = { exports: {} }
      cache.set(cand, m.exports)
      const fn = new Function('module', 'exports', 'require', '__dirname', '__filename', toCJS(cand))
      fn(m, m.exports, (id2) => requireStub(id2, cand), path.dirname(cand), cand)
      return m.exports
    }
  }
  return new Proxy(function Stub() {}, { get(t, p) { return typeof p === 'string' ? t : undefined } })
}

const counts = {}
const bad = []
for (const rel of files) {
  const abs = path.resolve(root, rel)
  try {
    const m = { exports: {} }
    const fn = new Function('module', 'exports', 'require', '__dirname', '__filename', toCJS(abs))
    fn(m, m.exports, (id) => requireStub(id, abs), path.dirname(abs), abs)
    const d = m.exports.default
    let c
    if (d === undefined) c = 'und'
    else if (typeof d === 'function') c = 'fn'
    else if (d && typeof d === 'object') {
      const t = d.$$typeof
      c = t ? String(t).replace('Symbol(', '').replace(')', '') : 'plain-object'
    } else c = String(typeof d)
    counts[c] = (counts[c] || 0) + 1
    if (c !== 'fn' && c !== 'und') {
      bad.push(rel + ' | ' + c + ' | ' + JSON.stringify(d && typeof d === 'object' ? Object.keys(d).slice(0, 6) : d))
    }
  } catch (e) {
    counts['LOAD-ERR'] = (counts['LOAD-ERR'] || 0) + 1
    bad.push(rel + ' | LOAD-ERR | ' + String(e.message).slice(0, 100))
  }
}
console.log('counts:', JSON.stringify(counts))
console.log('bad count:', bad.length)
for (const b of bad.slice(0, 80)) console.log(b)
