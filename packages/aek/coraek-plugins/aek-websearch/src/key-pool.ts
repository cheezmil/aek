/**
 * Write-side adapter over `@cheezmil/prevent-agent-directly-seeing-key`.
 *
 * WHY THIS EXISTS: the web profile currently resolves the PUBLISHED 0.1.3
 * build of KeyStore (a pnpm store copy), not this repository's
 * `packages/aek/public/prevent-agent-directly-seeing-key` source. That build
 * exposes `load() / status() / disableById() / enableById()` but no
 * create / update / delete, and `pnpm install` in this workspace is blocked by
 * the known pre-release version mismatch. The repository source already has
 * native `add/updateById/removeById/entries` methods for the NEXT release;
 * until that release is published, this adapter supplies the same operations
 * through the very sqlite handle KeyStore itself opens (`getDb()`), so the
 * passphrase, pragmas and WAL settings stay in exactly one place and no new
 * dependency is introduced.
 *
 * Plaintext never leaves the host for LIST reads: `entries()` returns masked
 * tags only. The one exception is an EXPLICIT user-initiated reveal (C4),
 * `reveal(id)` / `revealAll()`, which the admin surface exposes as a separate
 * `/keys/reveal` route so a listing call can never drag a literal across the
 * wire by accident. Rule 13 still stands: the agent never calls those routes.
 *
 * R6 (2026-11-09): deletion is a SOFT delete. The row is moved out of the
 * `keys` table (so the search runtime can never pick a deleted key again)
 * into `keys_recycle` in the same SQLCipher-encrypted database, with a
 * `deleted_at` timestamp. `purgeExpired(days)` permanently removes rows past
 * their retention window; `restore(id)` moves one back. The retention window
 * is a host preference (`aek-home.keyRetentionDays`, default 7), never a
 * hardcoded number in the UI.
 *
 * R1: `disabledReason` is recorded in the `key_flags` side table. The console
 * writes `manual`; the search CLI writes `balance` (402/432) or `invalid`
 * (401/403) when it auto-disables a key. Rows disabled by older builds before
 * this table existed fall back to `auto` — we never invent a specific cause.
 *
 * @module aek-websearch/key-pool
 */
import { chmodSync } from 'node:fs'
import { KeyStore, maskKey } from '@cheezmil/prevent-agent-directly-seeing-key'

/** Why a key is currently disabled. `auto` = disabled by an older build that did not record the cause. */
export type DisableReason = 'manual' | 'balance' | 'invalid' | 'auto'

/** One masked row, safe to send to the browser. */
export interface KeyPoolEntry {
  /** Real primary key (NOT `status()`'s 0-based display id). */
  id: number
  /** Masked display tag. */
  masked: string
  /** Whether the key is disabled. */
  disabled: boolean
  /** Recorded failure count. */
  failures: number
  /** Why it is disabled; `undefined` while enabled. */
  disabledReason?: DisableReason
}

/** One masked row in the recycle bin, safe to send to the browser. */
export interface RecycleEntry {
  /** Primary key inside `keys_recycle`. */
  id: number
  /** Masked display tag. */
  masked: string
  /** The id this row had in `keys` before deletion (display only). */
  originId: number
  /** Epoch ms when it was soft-deleted. */
  deletedAt: number
  /** Epoch ms when automatic purge will remove it. */
  purgeAt: number
  /** Disable reason carried over at deletion time. */
  disabledReason: DisableReason
}

/** The subset of better-sqlite3's statement API used here. */
interface Statement {
  /** Execute the statement with bound parameters. */
  run(...params: readonly unknown[]): { changes: number; lastInsertRowid: number | bigint }
  /** Read all result rows. */
  all(...params: readonly unknown[]): unknown[]
}

/** The subset of better-sqlite3's Database API used here. */
interface DatabaseHandle {
  /** Absolute path of the open database file, when available. */
  name?: string
  /** Prepare one statement. */
  prepare(sql: string): Statement
  /** Execute raw SQL (schema creation). */
  exec(sql: string): void
}

/** A row read back from `keys_recycle`. */
interface RecycleRow {
  id: number
  key_enc: string
  origin_id: number
  disabled: number
  failures: number
  reason: string
  deleted_at: number
}

/** A row read back from `key_flags`. */
interface FlagRow {
  key_id: number
  reason: string
}

/** The schema mirrors KeyStore's own table; `IF NOT EXISTS` keeps existing pools untouched. */
const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS keys (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    key_enc      TEXT NOT NULL,
    disabled     INTEGER NOT NULL DEFAULT 0,
    failures     INTEGER NOT NULL DEFAULT 0,
    cooldown_end BIGINT  NOT NULL DEFAULT 0
  )
`

/** Soft-deleted keys live here so KeyStore.load() can never see them again. */
const CREATE_RECYCLE_TABLE = `
  CREATE TABLE IF NOT EXISTS keys_recycle (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    origin_id    INTEGER NOT NULL,
    key_enc      TEXT NOT NULL,
    disabled     INTEGER NOT NULL DEFAULT 0,
    failures     INTEGER NOT NULL DEFAULT 0,
    cooldown_end BIGINT  NOT NULL DEFAULT 0,
    reason       TEXT NOT NULL DEFAULT '',
    deleted_at   BIGINT  NOT NULL
  )
`

/** Side table for R1: KeyStore's `load()` selects a fixed column list, so extra columns on `keys` are invisible to it. */
const CREATE_FLAGS_TABLE = `
  CREATE TABLE IF NOT EXISTS key_flags (
    key_id INTEGER PRIMARY KEY,
    reason TEXT NOT NULL DEFAULT ''
  )
`

/** One day in milliseconds. */
const DAY_MS = 86_400_000

/**
 * Borrow the already-configured sqlite handle from a KeyStore instance.
 * @param store - a live KeyStore.
 * @returns its database handle.
 * @throws when the installed KeyStore build has no `getDb()` seam.
 */
function dbOf(store: KeyStore): DatabaseHandle {
  const candidate = (store as unknown as { getDb?: () => DatabaseHandle }).getDb
  if (typeof candidate !== 'function') {
    throw new Error('incompatible KeyStore build: no database handle')
  }
  return candidate.call(store)
}

/** @param raw - untrusted reason string. @returns a known reason, or `auto`. */
function reasonOf(raw: unknown): DisableReason {
  return raw === 'manual' || raw === 'balance' || raw === 'invalid' ? raw : 'auto'
}

/** CRUD over one provider's encrypted key pool. */
export class KeyPool {
  /** @param kind - provider kind (adapter name). */
  constructor(private readonly kind: string) {}

  /**
   * Open the pool, ensure its schema and permissions, run one action, close.
   * @param action - work to do with the store and its handle.
   * @returns the action's result.
   */
  private transact<T>(action: (store: KeyStore, db: DatabaseHandle) => T): T {
    let store: KeyStore | undefined
    try {
      store = new KeyStore(this.kind)
      const db = dbOf(store)
      db.exec(CREATE_TABLE)
      db.exec(CREATE_RECYCLE_TABLE)
      db.exec(CREATE_FLAGS_TABLE)
      if (typeof db.name === 'string' && db.name.length > 0) {
        try { chmodSync(db.name, 0o600) } catch { /* best effort, non-fatal */ }
      }
      return action(store, db)
    } finally {
      store?.close()
    }
  }

  /** @returns id → recorded disable reason. */
  private flags(db: DatabaseHandle): Map<number, DisableReason> {
    const rows = db.prepare('SELECT key_id, reason FROM key_flags').all() as FlagRow[]
    return new Map(rows.map(row => [row.key_id, reasonOf(row.reason)]))
  }

  /** @returns masked live rows in insertion order. */
  entries(): KeyPoolEntry[] {
    return this.transact((store, db) => {
      const flags = this.flags(db)
      return store.load().map(entry => ({
        id: entry.id,
        masked: maskKey(entry.key),
        disabled: entry.disabled,
        failures: entry.failures,
        ...(entry.disabled ? { disabledReason: flags.get(entry.id) ?? 'auto' as DisableReason } : {}),
      }))
    })
  }

  /**
   * The ONE read that returns plaintext literals: an explicit, user-initiated
   * reveal of a single row (C4). The admin surface keeps it on its own
   * `/keys/reveal` route so that listing, counting and status never leak a
   * key, and an agent talking to the host cannot sweep the pool for secrets —
   * it can at most request one row by id, on purpose.
   * @param id - real row id.
   * @returns the decrypted literal, or `undefined` when the id is gone.
   */
  reveal(id: number): string | undefined {
    return this.transact(store => store.load().find(entry => entry.id === id)?.key)
  }

  /**
   * R3: explicit "reveal all" — same security boundary as `reveal(id)`, but
   * only ever triggered by the user clicking the eye-all icon in the console.
   * @returns id + literal for every live row.
   */
  revealAll(): Array<{ id: number; plain: string }> {
    return this.transact(store => store.load().map(entry => ({ id: entry.id, plain: entry.key })))
  }

  /** @param key - new literal. @returns the new row's real id. */
  add(key: string): number {
    return this.transact((_store, db) => Number(db.prepare(
      'INSERT INTO keys (key_enc, disabled, failures, cooldown_end) VALUES (?, 0, 0, 0)',
    ).run(key).lastInsertRowid))
  }

  /**
   * R2: import several newline-separated keys in one request.
   * @param keys - non-empty literals.
   * @returns how many rows were inserted.
   */
  addMany(keys: readonly string[]): number {
    return this.transact((_store, db) => {
      const insert = db.prepare(
        'INSERT INTO keys (key_enc, disabled, failures, cooldown_end) VALUES (?, 0, 0, 0)',
      )
      let count = 0
      db.exec('BEGIN')
      try {
        for (const key of keys) {
          insert.run(key)
          count += 1
        }
        db.exec('COMMIT')
      } catch (cause) {
        db.exec('ROLLBACK')
        throw cause
      }
      return count
    })
  }

  /** @param id - real row id. @param key - replacement literal. @returns false when the id is gone. */
  update(id: number, key: string): boolean {
    return this.transact((_store, db) => db.prepare(
      'UPDATE keys SET key_enc=?, failures=0, cooldown_end=0 WHERE id=?',
    ).run(key, id).changes > 0)
  }

  /**
   * R6: soft-delete one live row into the encrypted recycle bin.
   * @param id - real row id.
   * @returns false when the id is gone.
   */
  remove(id: number): boolean {
    return this.transact((store, db) => {
      const row = store.load().find(entry => entry.id === id)
      if (row === undefined) return false
      const reason = this.flags(db).get(id) ?? 'auto'
      db.prepare(
        'INSERT INTO keys_recycle (origin_id, key_enc, disabled, failures, cooldown_end, reason, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(id, row.key, row.disabled ? 1 : 0, row.failures, 0, reason, Date.now())
      db.prepare('DELETE FROM keys WHERE id=?').run(id)
      db.prepare('DELETE FROM key_flags WHERE key_id=?').run(id)
      return true
    })
  }

  /**
   * @param days - retention window; used to compute each row's purgeAt.
   * @returns masked recycle rows, newest first.
   */
  recycle(days: number): RecycleEntry[] {
    return this.transact((_store, db) => {
      const rows = db.prepare(
        'SELECT id, key_enc, origin_id, disabled, failures, reason, deleted_at FROM keys_recycle ORDER BY deleted_at DESC, id DESC',
      ).all() as RecycleRow[]
      return rows.map(row => ({
        id: row.id,
        masked: maskKey(row.key_enc),
        originId: row.origin_id,
        deletedAt: row.deleted_at,
        purgeAt: row.deleted_at + Math.max(1, days) * DAY_MS,
        disabledReason: reasonOf(row.reason),
      }))
    })
  }

  /**
   * R6: move one recycled row back into the live pool.
   * @param recycleId - id inside `keys_recycle`.
   * @returns false when the row is gone (already purged / restored).
   */
  restore(recycleId: number): boolean {
    return this.transact((_store, db) => {
      const rows = db.prepare(
        'SELECT id, key_enc, disabled, failures, reason FROM keys_recycle WHERE id=?',
      ).all(recycleId) as RecycleRow[]
      const row = rows[0]
      if (row === undefined) return false
      const newId = Number(db.prepare(
        'INSERT INTO keys (key_enc, disabled, failures, cooldown_end) VALUES (?, ?, ?, 0)',
      ).run(row.key_enc, row.disabled, row.failures).lastInsertRowid)
      db.prepare('INSERT OR REPLACE INTO key_flags (key_id, reason) VALUES (?, ?)').run(newId, row.reason)
      db.prepare('DELETE FROM keys_recycle WHERE id=?').run(recycleId)
      return true
    })
  }

  /**
   * @param recycleId - id inside `keys_recycle`.
   * @returns false when the row is gone.
   */
  purge(recycleId: number): boolean {
    return this.transact((_store, db) => db.prepare(
      'DELETE FROM keys_recycle WHERE id=?',
    ).run(recycleId).changes > 0)
  }

  /**
   * R6: permanently drop every row past its retention window. Called on host
   * startup and on every key-pool read, so an unattended instance still cleans
   * up as soon as the console or the host touches the pool.
   * @param days - retention window from the host preference.
   * @returns how many rows were permanently deleted.
   */
  purgeExpired(days: number): number {
    const cutoff = Date.now() - Math.max(1, days) * DAY_MS
    return this.transact((_store, db) => db.prepare(
      'DELETE FROM keys_recycle WHERE deleted_at <= ?',
    ).run(cutoff).changes)
  }

  /** @param id - real row id. @param disabled - desired state. @returns false when the id is gone. */
  setDisabled(id: number, disabled: boolean, reason: DisableReason = 'manual'): boolean {
    return this.transact((_store, db) => {
      const sql = disabled
        ? 'UPDATE keys SET disabled=1 WHERE id=?'
        : 'UPDATE keys SET disabled=0, failures=0, cooldown_end=0 WHERE id=?'
      const changed = db.prepare(sql).run(id).changes > 0
      if (!changed) return false
      if (disabled) {
        db.prepare('INSERT OR REPLACE INTO key_flags (key_id, reason) VALUES (?, ?)').run(id, reason)
      } else {
        db.prepare('DELETE FROM key_flags WHERE key_id=?').run(id)
      }
      return true
    })
  }
}
