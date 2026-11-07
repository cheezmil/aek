/**
 * KeyStore — encrypted API key storage using SQLCipher (SQLite3MultipleCiphers).
 *
 * All keys are stored encrypted at rest via SQLCipher. The passphrase is
 * derived per-provider from a fixed salt. Raw file inspection shows only
 * ciphertext; programmatic access requires the correct passphrase.
 *
 * Schema (single table, per-provider):
 *   keys (
 *     id           INTEGER PRIMARY KEY AUTOINCREMENT,
 *     key_enc      TEXT NOT NULL,    -- encrypted API key (SQLCipher level)
 *     disabled     INTEGER NOT NULL DEFAULT 0,
 *     failures     INTEGER NOT NULL DEFAULT 0,
 *     cooldown_end BIGINT  NOT NULL DEFAULT 0  -- epoch ms
 *   )
 *
 * Migration: auto-converts existing {provider}.txt → {provider}.db if present.
 *
 * @module aek-websearch/key-store
 */

import Database from 'better-sqlite3-multiple-ciphers'
import { readFileSync, existsSync, chmodSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

// ── Constants ────────────────────────────────────────────────────────────────

const PASSPHRASE_SALT = 'aek-websearch-v1-key-store-salt'
const DB_PERMISSIONS = 0o600

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a stable passphrase for a provider. */
function derivePassphrase(provider: string): string {
  return createHash('sha256')
    .update(PASSPHRASE_SALT)
    .update(':')
    .update(provider)
    .digest('hex')
}

/** Mask a key for display: first 4 + last 4 chars. */
export function maskKey(key: string): string {
  if (key.length <= 8) return '****'
  return key.slice(0, 4) + '…' + key.slice(-4)
}

// ── Path helpers ─────────────────────────────────────────────────────────────

function aekDir(): string {
  return join(process.env.HOME ?? '', '.aek', 'websearch')
}

function dbPath(provider: string): string {
  return join(aekDir(), `${provider}.db`)
}

function txtPath(provider: string): string {
  return join(aekDir(), `${provider}.txt`)
}

// ── Migration ────────────────────────────────────────────────────────────────

/**
 * If a plain-text {provider}.txt exists but no .db yet, migrate it.
 * Keys are transparently stored by SQLCipher; the .txt file is renamed to .bak.
 */
function migrateIfTxt(provider: string, passphrase: string): void {
  const dbP = dbPath(provider)
  const txtP = txtPath(provider)

  if (!existsSync(txtP) || existsSync(dbP)) return

  try {
    const content = readFileSync(txtP, 'utf-8')
    const keys = content
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('//'))
    if (keys.length === 0) return

    // Create encrypted database
    // NOTE: must NOT enable WAL before rekey (SQLCipher limitation)
    const db = new Database(dbP)
    db.pragma(`key = '${passphrase}'`)

    db.exec(`
      CREATE TABLE keys (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        key_enc      TEXT NOT NULL,
        disabled     INTEGER NOT NULL DEFAULT 0,
        failures     INTEGER NOT NULL DEFAULT 0,
        cooldown_end BIGINT  NOT NULL DEFAULT 0
      )
    `)

    for (const key of keys) {
      db.prepare('INSERT INTO keys (key_enc, disabled, failures, cooldown_end) VALUES (?, 0, 0, 0)').run(key)
    }

    db.pragma(`rekey = '${passphrase}'`)  // must come after CREATE TABLE
    db.pragma('vacuum')                   // must vacuum to persist encryption
    db.pragma('journal_mode = WAL')       // enable WAL after encryption
    db.close()
    chmodSync(dbP, DB_PERMISSIONS)

    // Backup original .txt
    const bakP = txtP + '.bak'
    if (existsSync(bakP)) {
      unlinkSync(txtP)
    } else {
      renameSync(txtP, bakP)
    }

  } catch (err) {
    console.error(`[aek-websearch] migration failed for ${provider}:`, err)
  }
}

// ── KeyStore class ───────────────────────────────────────────────────────────

export interface KeyEntry {
  id: number
  key: string            // plaintext (only in memory)
  disabled: boolean
  failures: number
  cooldownEnd: number    // epoch ms, 0 = not cooling
}

export class KeyStore {
  readonly provider: string
  private db: Database | null = null
  private passphrase: string

  constructor(provider: string) {
    this.provider = provider
    this.passphrase = derivePassphrase(provider)
    migrateIfTxt(provider, this.passphrase)
  }

  private getDb(): Database {
    if (!this.db) {
      const path = dbPath(this.provider)
      this.db = new Database(path)
      this.db.pragma(`key = '${this.passphrase}'`)  // MUST set key first
      this.db.pragma('journal_mode = WAL')          // then enable WAL
      this.db.pragma('foreign_keys = ON')
    }
    return this.db
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /** Load all keys into memory. Returns empty array if no DB or error. */
  load(): KeyEntry[] {
    try {
      const db = this.getDb()
      const rows = db.prepare(
        'SELECT id, key_enc, disabled, failures, cooldown_end FROM keys ORDER BY id',
      ).all() as Array<{ id: number; key_enc: string; disabled: number; failures: number; cooldown_end: number }>

      return rows.map(row => ({
        id: row.id,
        key: row.key_enc,  // SQLCipher decrypts transparently
        disabled: row.disabled === 1,
        failures: row.failures,
        cooldownEnd: row.cooldown_end,
      }))
    } catch {
      return []
    }
  }

  /** Disable a key by id. */
  disableById(id: number): void {
    const db = this.getDb()
    db.prepare('UPDATE keys SET disabled=1 WHERE id=?').run(id)
  }

  /** Enable a key by id. */
  enableById(id: number): void {
    const db = this.getDb()
    db.prepare('UPDATE keys SET disabled=0, failures=0, cooldown_end=0 WHERE id=?').run(id)
  }

  /** Reset all cooldowns. */
  resetCooldowns(): void {
    const db = this.getDb()
    db.prepare('UPDATE keys SET failures=0, cooldown_end=0').run()
  }

  /**
   * Make sure the `keys` table exists. A provider with no pool file yet has
   * no schema at all, so INSERT/UPDATE/DELETE would fail on first write.
   * Mirrors `migrateIfTxt`'s create + rekey + vacuum sequence for a brand-new
   * encrypted database; a no-op for an existing pool.
   */
  private ensureSchema(): void {
    const db = this.getDb()
    const existing = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='keys'",
    ).get()
    if (existing !== undefined) return
    db.exec(`
      CREATE TABLE keys (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        key_enc      TEXT NOT NULL,
        disabled     INTEGER NOT NULL DEFAULT 0,
        failures     INTEGER NOT NULL DEFAULT 0,
        cooldown_end BIGINT  NOT NULL DEFAULT 0
      )
    `)
    // NOTE: must NOT enable WAL before rekey (SQLCipher limitation).
    db.pragma(`rekey = '${this.passphrase}'`)
    db.pragma('vacuum')
    db.pragma('journal_mode = WAL')
    chmodSync(dbPath(this.provider), DB_PERMISSIONS)
  }

  /** Append one API key. @returns the new row's real (1-based) id. */
  add(key: string): number {
    this.ensureSchema()
    const db = this.getDb()
    const result = db.prepare(
      'INSERT INTO keys (key_enc, disabled, failures, cooldown_end) VALUES (?, 0, 0, 0)',
    ).run(key)
    return Number(result.lastInsertRowid)
  }

  /** Replace one key's literal by its real row id. @returns false when the id is gone. */
  updateById(id: number, key: string): boolean {
    this.ensureSchema()
    const db = this.getDb()
    const result = db.prepare(
      'UPDATE keys SET key_enc=?, failures=0, cooldown_end=0 WHERE id=?',
    ).run(key, id)
    return result.changes > 0
  }

  /** Delete one key by its real row id. @returns false when the id is gone. */
  removeById(id: number): boolean {
    this.ensureSchema()
    const db = this.getDb()
    return db.prepare('DELETE FROM keys WHERE id=?').run(id).changes > 0
  }

  /**
   * Masked entries for management UIs. Unlike `status()`, the ids here are
   * the REAL primary keys, so they are safe to use in update/delete calls.
   * Plaintext never leaves this method.
   */
  entries(): Array<{
    id: number
    masked: string
    disabled: boolean
    failures: number
    cooldownEnd: number
  }> {
    return this.load().map(entry => ({
      id: entry.id,
      masked: maskKey(entry.key),
      disabled: entry.disabled,
      failures: entry.failures,
      cooldownEnd: entry.cooldownEnd,
    }))
  }

  /** Count of entries. */
  count(): number {
    try {
      const db = this.getDb()
      const r = db.prepare('SELECT COUNT(*) as cnt FROM keys').get() as { cnt: number }; return r.cnt
    } catch { return 0 }
  }

  /** Get status of all keys (masked). */
  status(): Array<{
    id: number
    masked: string
    disabled: boolean
    failures: number
    cooldownRemaining?: string
  }> {
    const entries = this.load()
    const now = Date.now()
    return entries.map((e) => {
      const r: any = {
        id: e.id - 1, // 0-based for display
        masked: maskKey(e.key),
        disabled: e.disabled,
        failures: e.failures,
      }
      if (e.cooldownEnd > now) {
        r.cooldownRemaining = Math.ceil((e.cooldownEnd - now) / 1000) + 's'
      }
      return r
    })
  }
}
