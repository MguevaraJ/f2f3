// One-off codemod: wraps the Spanish UI texts in tr() so they can be translated.
//   node scripts/i18n-wrap.mjs [--dry] files…
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import ts from 'typescript'

const dry = process.argv.includes('--dry')
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))

// Texts the heuristics miss, one JSON string per line (I18N_FORCE=file).
const FORCE = new Set(
  process.env.I18N_FORCE
    ? readFileSync(process.env.I18N_FORCE, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : []
)
const STOP = new Set(
  'de la el en los las un una por para con sin del al no se que y o a es más ya su tu esta este hay como si lo le sus tus muy'.split(
    ' '
  )
)
const SKIP_ATTRS = new Set([
  'className',
  'style',
  'key',
  'type',
  'id',
  'name',
  'd',
  'viewBox',
  'fill',
  'stroke',
  'href',
  'src',
  'role',
  'htmlFor',
  'rel',
  'target',
  'method',
  'value',
  'defaultValue',
  'autoComplete',
  'inputMode',
  'pattern',
  'lang',
  'dir',
  'draggable',
  'strokeLinecap',
  'strokeLinejoin',
  'strokeWidth',
  'xmlns',
  'width',
  'height',
  'accept',
  'tabIndex',
  'data-kind',
  'icon',
  'size',
  'variant',
  'kind',
  'level',
  'mode',
  'tone',
  'color',
  'align',
  'position'
])
const SKIP_CALLS =
  /^(require|invoke|handle|on|once|emit|send|join|resolve|dirname|basename|extname|existsSync|readFileSync|getElementById|querySelector|querySelectorAll|addEventListener|removeEventListener|setAttribute|getAttribute|getItem|setItem|removeItem|includes|startsWith|endsWith|indexOf|split|replace|replaceAll|match|test|get|set|has|delete|padStart|padEnd|localeCompare|toLocaleString|toLocaleDateString|toLocaleTimeString|createElement|getContext|getPath|setPath|hasSwitch|appendSwitch|registerSchemesAsPrivileged|describe|it|expect|URL|RegExp|Intl|z|literal|enum|tr|str|Symbol|fetch|encodeURIComponent)$/

function spanish(text, loose) {
  if (FORCE.has(text)) return true
  const s = text.trim()
  if (s.length < 2 || !/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(s)) return false
  if (/^(minecraft:|https?:|[a-z]+:\/\/|#|rgba?\(|\.{0,2}\/|@)/.test(s)) return false
  if (/^[\w.-]+\.(png|jpe?g|json|nbt|jar|zip|css|ts|tsx|js|txt|csv|xlsx|exe|AppImage)$/i.test(s))
    return false
  if (/^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/.test(s) || s.includes('<') || /^Bearer\b/.test(s))
    return false
  if (/\b(translate|rotate|scale|rgba?|calc|url|var)\(/.test(s)) return false
  if (/[áéíóúñÁÉÍÓÚÑ¿¡…]/.test(s)) return true
  const words = s
    .toLowerCase()
    .split(/[^a-záéíóúñü]+/)
    .filter(Boolean)
  if (words.length > 1 && words.some((w) => STOP.has(w))) return true
  // "Guardar", "Copiar": one capitalised word (or a few), not an identifier.
  if (/^[A-Z][a-z]{2,}([ ,.:!?()0-9]|[a-z])*$/.test(s) && !/^[A-Z][a-z]+[A-Z]/.test(s))
    return loose || words.length > 1
  if (loose && words.length > 1 && /^[a-z(]/.test(s) && /\s/.test(s) && !/[-_=;{}<>]/.test(s))
    return true
  return false
}

const quote = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"

/** JSX text as React renders it: lines trimmed and joined by a space. */
function jsxText(raw) {
  const lines = raw.split(/\r?\n/)
  return lines
    .map((l, i) => {
      let x = l.replace(/\t/g, ' ')
      if (i > 0) x = x.replace(/^ +/, '')
      if (i < lines.length - 1) x = x.replace(/ +$/, '')
      return x
    })
    .filter((l) => l.length > 0 || lines.length === 1)
    .join(' ')
}

function calleeName(call) {
  const e = call.expression
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) return e.name.text
  return ''
}

/** Whether a string at this position is something shown to people. */
function allowed(node) {
  let child = node
  for (let p = node.parent; p; child = p, p = p.parent) {
    if (
      ts.isImportDeclaration(p) ||
      ts.isExportDeclaration(p) ||
      ts.isTypeNode(p) ||
      ts.isLiteralTypeNode(p)
    )
      return false
    if (ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isEnumMember(p))
      return false
    if (ts.isCaseClause(p) && p.expression === child) return false
    if (ts.isElementAccessExpression(p) && p.argumentExpression === child) return false
    if (ts.isPropertyAssignment(p) && p.name === child) return false
    if (ts.isBinaryExpression(p)) {
      const k = p.operatorToken.kind
      if (
        k === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        k === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        k === ts.SyntaxKind.EqualsEqualsToken ||
        k === ts.SyntaxKind.ExclamationEqualsToken ||
        k === ts.SyntaxKind.InKeyword
      )
        return false
    }
    if (ts.isJsxAttribute(p)) return !SKIP_ATTRS.has(p.name.getText())
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
      if (p.expression === child) continue
      const name = ts.isCallExpression(p) ? calleeName(p) : p.expression.getText()
      if (name === 'tr') {
        if (p.arguments[0] === child) return false
        continue
      }
      if (SKIP_CALLS.test(name) && child === node) return false
      if (
        ts.isCallExpression(p) &&
        ts.isPropertyAccessExpression(p.expression) &&
        /^(console|ipcMain|ipcRenderer|path|fs|JSON|Math|Object|localStorage|process)$/.test(
          p.expression.expression.getText()
        )
      )
        return false
    }
    if (ts.isTaggedTemplateExpression(p)) return false
    if (ts.isAsExpression(p) && p.type.getText() === 'const') return false
    if (ts.isExpressionStatement(p) && p.expression === node) return false // directive
    if (ts.isFunctionLike(p) || ts.isSourceFile(p)) break
  }
  return true
}

let total = 0
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const edits = []
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const shown = jsxText(node.text)
      const core = shown.trim()
      if (
        core &&
        !core.includes('&') &&
        !/[{}]/.test(core) &&
        /[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}/.test(core)
      ) {
        const lead = /^\s/.test(shown) && !/^\s*\n/.test(node.text) ? "{' '}" : ''
        const trail = /\s$/.test(shown) && !/\n\s*$/.test(node.text) ? "{' '}" : ''
        const raw = node.getFullText()
        const head = raw.match(/^\s*/)[0]
        const tail = raw.match(/\s*$/)[0]
        edits.push([
          node.getFullStart(),
          node.getEnd(),
          `${head.includes('\n') ? head : ''}${lead}{tr(${quote(core)})}${trail}${tail.includes('\n') ? tail : ''}`
        ])
      }
      return
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const inJsx = ts.isJsxAttribute(node.parent)
      if (
        allowed(node) &&
        spanish(
          node.text,
          inJsx || ts.isJsxExpression(node.parent) || ts.isConditionalExpression(node.parent)
        )
      ) {
        const call = `tr(${quote(node.text)})`
        edits.push([node.getStart(), node.getEnd(), inJsx ? `{${call}}` : call])
      } else if (
        process.env.REST &&
        allowed(node) &&
        /[a-záéíóúñ]{3,}/.test(node.text) &&
        (process.env.REST === 'all' || !/^[a-z0-9_:./#-]+$/i.test(node.text.trim()))
      )
        console.log(`${file}\t${JSON.stringify(node.text).slice(0, 90)}`)
      return
    }
    if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
      if (allowed(node) && spanish(parts.join(' '), true)) {
        let key = parts[0]
        const args = []
        node.templateSpans.forEach((span, i) => {
          key += `{${i}}` + span.literal.text
          args.push(text.slice(span.expression.getStart(), span.expression.getEnd()))
        })
        edits.push([
          node.getStart(),
          node.getEnd(),
          `tr(${[quote(key), ...args].join(', ')})`,
          node
        ])
        // Strings inside the placeholders are handled on a later pass.
        return
      }
      if (process.env.REST && allowed(node) && /[A-Za-záéíóúñ]{3,}/.test(parts.join(' ')))
        console.log(`${file}\tT ${JSON.stringify(parts.join('{}')).slice(0, 110)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (!edits.length) continue
  total += edits.length
  let out = text
  for (const [start, end, repl] of edits.sort((a, b) => b[0] - a[0]))
    out = out.slice(0, start) + repl + out.slice(end)
  if (!/\btr\b.*from ['"].*i18n/.test(out)) {
    const inShared = file.includes('src/shared/')
    const spec = inShared
      ? (relative(dirname(file), 'src/shared/i18n') || '.').replace(/^(?!\.)/, './')
      : '@shared/i18n'
    const imports = [...out.matchAll(/^import [\s\S]*?from ['"][^'"]+['"];?$/gm)]
    const at = imports.length
      ? imports[imports.length - 1].index + imports[imports.length - 1][0].length
      : 0
    out =
      out.slice(0, at) +
      (at ? '\n' : '') +
      `import { tr } from '${spec}'` +
      (at ? '' : '\n') +
      out.slice(at)
  }
  if (dry) console.log(file, edits.length)
  if (process.env.LIST)
    for (const e of edits) console.log('   ', e[2].slice(0, 110).replace(/\n/g, ' '))
  else writeFileSync(file, out)
}
console.log(`${total} texts in ${files.length} files`)
