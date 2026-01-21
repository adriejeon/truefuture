/**
 * Cloudflare Workers 환경을 위한 Node.js API Polyfills
 * @deno/shim-deno에서 필요로 하는 __dirname, __filename 등을 제공
 */

// __dirname과 __filename polyfill
if (typeof globalThis.__dirname === 'undefined') {
  globalThis.__dirname = '/';
}

if (typeof globalThis.__filename === 'undefined') {
  globalThis.__filename = '/index.js';
}

// process.cwd() polyfill (필요한 경우)
if (typeof globalThis.process === 'undefined') {
  globalThis.process = {};
}

if (typeof globalThis.process.cwd === 'undefined') {
  globalThis.process.cwd = () => '/';
}

export {};
