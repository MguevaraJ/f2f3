// Lists every text passed to tr() and, with --missing, the ones the English dictionary lacks.
//   node scripts/i18n-keys.mjs [--missing]
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : []
  })

const keys = new Map()
for (const file of walk('src')) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tr') {
      const a = n.arguments[0]
      if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) {
        if (!keys.has(a.text)) keys.set(a.text, file)
      } else console.error(`${file}: tr() without a literal text`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}
let list = [...keys.keys()]
if (process.argv.includes('--missing')) {
  const en = readFileSync('src/shared/i18n/en.ts', 'utf8')
  const sfEn = ts.createSourceFile('en.ts', en, ts.ScriptTarget.Latest, true)
  const have = new Set()
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && (ts.isStringLiteral(n.name) || ts.isIdentifier(n.name)))
      have.add(n.name.text)
    ts.forEachChild(n, visit)
  }
  visit(sfEn)
  list = list.filter((k) => !have.has(k))
}
if (process.argv.includes('--files'))
  for (const k of list) console.log(`${keys.get(k)}\t${JSON.stringify(k)}`)
else console.log(JSON.stringify(list, null, 0).replace(/","/g, '",\n"'))
console.error(`${list.length} texts`)
