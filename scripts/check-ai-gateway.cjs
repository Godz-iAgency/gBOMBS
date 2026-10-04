// Typecheck the Deno entrypoint against the installed Supabase SDK. This uses
// a virtual Deno declaration and resolves imports locally, with no downloads.
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve('supabase/functions/ai-generate');
const shim = path.join(root, 'runtime-shim.d.ts');
const declaration = 'declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void };';
const options = {
  strict: true, noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true,
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
};
const host = ts.createCompilerHost(options);
const originalGet = host.getSourceFile.bind(host);
host.getSourceFile = (filename, ...args) => filename === shim
  ? ts.createSourceFile(shim, declaration, options.target, true) : originalGet(filename, ...args);
host.resolveModuleNames = (names, containingFile) => names.map((name) => {
  if (name.startsWith('jsr:')) return { resolvedFileName: shim, extension: ts.Extension.Dts };
  if (name.startsWith('https://esm.sh/@supabase/supabase-js')) name = '@supabase/supabase-js';
  return ts.resolveModuleName(name, containingFile, options, ts.sys).resolvedModule;
});
const program = ts.createProgram([path.join(root, 'index.ts'), shim], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => process.cwd(), getCanonicalFileName: (file) => file, getNewLine: () => '\n',
  }));
  process.exitCode = 1;
} else console.log('AI gateway core and Deno entrypoint typecheck passed (offline SDK resolution).');
