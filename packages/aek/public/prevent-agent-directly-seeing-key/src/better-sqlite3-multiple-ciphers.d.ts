declare module 'better-sqlite3-multiple-ciphers' {
  export default class Database {
    constructor(path: string, options?: { readonly?: boolean })
    pragma(source: string): any
    exec(sql: string): this
    prepare(sql: string): Statement
    close(): void
  }

  export interface Statement {
    all(): any[]
    get(): any
    run(...params: any[]): RunResult
  }

  export interface RunResult {
    changes: number
    lastInsertRowid: number
  }
}
