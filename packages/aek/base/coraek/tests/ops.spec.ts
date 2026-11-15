/**
 * Unit tests for the X2 operation ledger (`ops.mjs`): the "how far is that
 * action" truth — append / advance / list / the host-restart close-out. No
 * real AEK_HOME is touched — the ledger uses a temp directory.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appendOp,
  listOps,
  markHostRestartOps,
  opsPath,
  readOps,
  updateOp,
} from '../ops.mjs'

/** One temp AEK home per test. */
function freshHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'aek-ops-'))
  return home
}

describe('ops ledger', () => {
  let home: string

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('a missing ledger is the fresh-install shape, not an error', () => {
    home = freshHome()
    expect(readOps(home)).toEqual([])
    expect(listOps(home)).toEqual([])
    expect(existsSync(opsPath(home))).toBe(false)
  })

  it('appendOp creates a running entry and the file persists atomically', () => {
    home = freshHome()
    const entry = appendOp(home, {
      kind: 'plugin-restart',
      title: 'aek-prompt-manager · restart',
      owner: 'aek-websearch',
      steps: [
        { label: 'queued', state: 'done' },
        { label: 'waiting for host restart', state: 'active' },
        { label: 'done', state: 'pending' },
      ],
    })
    expect(entry.id).toBeTruthy()
    expect(entry.status).toBe('running')
    expect(JSON.parse(readFileSync(opsPath(home), 'utf8')).version).toBe(1)
    // The client polls by id: the entry is readable back.
    const listed = listOps(home)
    expect(listed[0]?.id).toBe(entry.id)
    expect(listed[0]?.steps[1]?.state).toBe('active')
  })

  it('updateOp advances steps and closes the entry; unknown ids answer false', () => {
    home = freshHome()
    const entry = appendOp(home, {
      kind: 'runtime-add',
      title: 'runtime1',
      steps: [
        { label: 'persist', state: 'done' },
        { label: 'spawn', state: 'active' },
      ],
    })
    expect(updateOp(home, 'no-such-id', { status: 'done' })).toBe(false)
    expect(updateOp(home, entry.id, {
      status: 'done',
      steps: [
        { label: 'persist', state: 'done' },
        { label: 'spawn', state: 'done' },
      ],
    })).toBe(true)
    expect(readOps(home)[0]).toMatchObject({ id: entry.id, status: 'done' })
  })

  it('listOps returns the newest entries FIRST', () => {
    home = freshHome()
    const a = appendOp(home, { kind: 'x', title: 'a', steps: [{ label: 's', state: 'done' }], status: 'done' })
    const b = appendOp(home, { kind: 'x', title: 'b', steps: [{ label: 's', state: 'active' }] })
    const listed = listOps(home)
    expect(listed.map(op => op.id)).toEqual([b.id, a.id])
  })

  it('markHostRestartOps closes only the entries that were waiting on the host', () => {
    home = freshHome()
    const waiting = appendOp(home, {
      kind: 'plugin-restart-host',
      title: 'in-host restart',
      pendingHostRestart: true,
      steps: [
        { label: 'queued', state: 'done' },
        { label: 'host restarted', state: 'active' },
        { label: 'done', state: 'pending' },
      ],
    })
    const live = appendOp(home, {
      kind: 'runtime-add',
      title: 'live op',
      steps: [{ label: 'spawn', state: 'active' }],
    })
    const closed = markHostRestartOps(home)
    expect(closed).toBe(1)
    const after = Object.fromEntries(readOps(home).map(op => [op.id, op]))
    expect(after[waiting.id]?.status).toBe('done')
    expect(after[waiting.id]?.pendingHostRestart).toBeUndefined()
    expect(after[waiting.id]?.steps.map(step => step.state)).toEqual(['done', 'done', 'done'])
    // A live (non-host-waiting) running entry is untouched.
    expect(after[live.id]?.status).toBe('running')
    // Idempotent: a second boot call closes nothing.
    expect(markHostRestartOps(home)).toBe(0)
  })
})
