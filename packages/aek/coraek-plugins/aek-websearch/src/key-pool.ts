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
 * Plaintext never leaves the host: `entries()` returns masked tags only.
 *
 * @module aek-websearch/key-pool
 */
import { chmodSync } from 'node:fs'
import { KeyStore, maskKey } from '@cheezmil/prevent-agent-directly-seeing-key'

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
}

/** The subset of better-sqlite3's statement API used here. */
interface Statement {
  /** Execute the statement with bound parameters. */
  run(...params: readonly unknown[]): { changes: number; lastInsertRowid: number | bigint }
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
      if (typeof db.name === 'string' && db.name.length > 0) {
        try { chmodSync(db.name, 0o600) } catch { /* best effort, non-fatal */ }
      }
      return action(store, db)
    } finally {
      store?.close()
    }
  }

  /** @returns masked rows in insertion order. */
  entries(): KeyPoolEntry[] {
    return this.transact(store => store.load().map(entry => ({
      id: entry.id,
      masked: maskKey(entry.key),
      disabled: entry.disabled,
      failures: entry.failures,
    })))
  }

  /** @param key - new literal. @returns the new row's real id. */
  add(key: string): number {
    return this.transact((_store, db) => Number(db.prepare(
      'INSERT INTO keys (key_enc, disabled, failures, cooldown_end) VALUES (?, 0, 0, 0)',
    ).run(key).lastInsertRowid))
  }

  /** @param id - real row id. @param key - replacement literal. @returns false when the id is gone. */
  update(id: number, key: string): boolean {
    return this.transact((_store, db) => db.prepare(
      'UPDATE keys SET key_enc=?, failures=0, cooldown_end=0 WHERE id=?',
    ).run(key, id).changes > 0)
  }

  /** @param id - real row id. @returns false when the id is gone. */
  remove(id: number): boolean {
    return this.transact((_store, db) => db.prepare('DELETE FROM keys WHERE id=?').run(id).changes > 0)
  }

  /** @param id - real row id. @param disabled - desired state. @returns false when the id is gone. */
  setDisabled(id: number, disabled: boolean): boolean {
    return this.transact((_store, db) => {
      const sql = disabled
        ? 'UPDATE keys SET disabled=1 WHERE id=?'
        : 'UPDATE keys SET disabled=0, failures=0, cooldown_end=0 WHERE id=?'
      return db.prepare(sql).run(id).changes > 0
    })
  }
}
