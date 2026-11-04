#!/usr/bin/env node
// aek-prompt-manager — 长名 bin。与 aekpm 同一启动器，同一三分支逻辑。
import { setWindowsNodePath } from './_win-bootstrap.mjs';
setWindowsNodePath();
await import('./_bootstrap.mjs');
