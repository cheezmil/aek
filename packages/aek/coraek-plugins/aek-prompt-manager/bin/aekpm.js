#!/usr/bin/env node
// aekpm — aek-prompt-manager 的短别名。
// 三分支上下文识别（installed / local / npm）统一在 _bootstrap.mjs；
// 不重复解析路径、不二次 spawn。
import { setWindowsNodePath } from './_win-bootstrap.mjs';
setWindowsNodePath();
await import('./_bootstrap.mjs');
