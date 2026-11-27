const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function generate() {
  const entry = path.join(root, 'dist/index.d.ts');
  if (!fs.existsSync(entry)) throw new Error('Build declarations before generating the API reference');
  const program = ts.createProgram([entry], { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.CommonJS, skipLibCheck: true });
  const checker = program.getTypeChecker(), source = program.getSourceFile(entry);
  const module = checker.getSymbolAtLocation(source);
  if (!module) throw new Error('Cannot resolve public SDK declarations');
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true });
  const exported = checker.getExportsOfModule(module).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const lines = ['# Generated public API', '',
    'Generated from the built `dist/index.d.ts` export graph with `pnpm run docs:api`. Public/protected declaration signatures are preserved; private members are omitted. Types referenced by a signature are resolved by the installed SDK declarations, not by copying these snippets into an application.', '',
    'For behavior, lifecycle, compatibility and examples, see [the API guide](api-reference.md).', ''];
  for (const alias of exported) {
    const symbol = alias.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(alias) : alias;
    const declarations = symbol.getDeclarations() ?? [];
    const rendered = [];
    for (let declaration of declarations) {
      const file = declaration.getSourceFile();
      if (!path.resolve(file.fileName).startsWith(path.join(root, 'dist') + path.sep)) continue;
      if (ts.isClassDeclaration(declaration)) {
        const members = declaration.members.filter(member => !member.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.PrivateKeyword) &&
          !(member.name && ts.isPrivateIdentifier(member.name)));
        declaration = ts.factory.updateClassDeclaration(declaration, declaration.modifiers, declaration.name, declaration.typeParameters, declaration.heritageClauses, members);
      } else if (ts.isVariableDeclaration(declaration)) {
        declaration = declaration.parent.parent;
      }
      const text = printer.printNode(ts.EmitHint.Unspecified, declaration, file).trim();
      if (text && !rendered.some(item => item.text === text)) rendered.push({ file: file.fileName, text });
    }
    if (!rendered.length) throw new Error('No local declaration for public export: ' + alias.name);
    const file = path.relative(path.join(root, 'dist'), rendered[0].file).replace(/\\/g, '/').replace(/\.d\.ts$/, '.ts');
    lines.push('## ' + alias.name, '', '[Source declaration](../' + file + ')', '', '```ts', ...rendered.map(item => item.text), '```', '');
  }
  return { content: lines.join('\n'), exports: exported.length };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const output = args.length === 2 && args[0] === '--output' ? path.resolve(args[1]) : undefined;
    if (!output && (args.length > 1 || args.length === 1 && args[0] !== '--check')) throw new Error('Usage: generate-api-reference.cjs [--check | --output PATH]');
    const result = generate(), target = output ?? path.join(root, 'docs/api-generated.md');
    if (args.includes('--check')) {
      const actual = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
      if (actual !== result.content) {
        const expectedLines = result.content.split('\n'), actualLines = actual.split('\n');
        const first = expectedLines.findIndex((line, index) => line !== actualLines[index]);
        const index = first < 0 ? Math.min(expectedLines.length, actualLines.length) : first;
        // Both inputs are public declaration reference text, never provider payloads.
        console.error('First API reference mismatch at line ' + (index + 1));
        console.error('Committed: ' + JSON.stringify(actualLines[index]));
        console.error('Generated: ' + JSON.stringify(expectedLines[index]));
        throw new Error('Public API reference is stale; run pnpm run docs:api');
      }
      console.log('Public API reference verified: ' + result.exports + ' exports');
    } else {
      fs.writeFileSync(target, result.content);
      console.log('Public API reference generated: ' + result.exports + ' exports');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { generate };
