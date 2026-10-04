// Check actual local credentials without printing their values or fingerprints.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
const client = files('src').filter((file) => /\.(tsx?|js)$/.test(file)).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
assert(!/generativelanguage\.googleapis\.com|api\.groq\.com|EXPO_PUBLIC_(?:GEMINI|GROQ|OPENROUTER)_API_KEY/.test(client), 'Browser provider transport or credential reference found');
const names = new Set(['GEMINI_API_KEY', 'EXPO_PUBLIC_GEMINI_API_KEY', 'GROQ_API_KEY', 'EXPO_PUBLIC_GROQ_API_KEY', 'EXPO_PUBLIC_OPENROUTER_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY']);
const entries = [];
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match && names.has(match[1])) {
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      if (value.length > 12) entries.push({ name: match[1], value });
    }
  }
}
const exported = files('dist').map((file) => fs.readFileSync(file));
const leaks = entries.filter((entry) => exported.some((file) => file.includes(Buffer.from(entry.value)))).map((entry) => entry.name);
assert.equal(leaks.length, 0, `Private credentials embedded in export: ${leaks.join(', ')}`);
console.log(JSON.stringify({ sourceProviderReferences: 0, credentialNamesChecked: entries.map((entry) => entry.name), exportedFiles: exported.length, exposedCredentials: 0 }));
