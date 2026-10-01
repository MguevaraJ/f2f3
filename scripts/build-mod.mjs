// Builds the F2+F3 Companion mod (its own repository, next to this one) for every
// Minecraft version and copies the jars into resources/, where the app bundles them.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repo = resolve(process.env.F2F3_COMPANION_DIR ?? '../f2f3-companion')
// [project folder, Minecraft version, jar in resources/]
const builds = [
  ['fabric-26.3', '26.3', 'craftshot-companion.jar'],
  ['fabric-1.21.1', '1.21.1', 'craftshot-companion-1.21.1.jar'],
  ['fabric-1.20.1', '1.20.1', 'craftshot-companion-1.20.1.jar']
]

if (!existsSync(repo)) {
  console.error(`No se encontró el repositorio del mod en ${repo} (define F2F3_COMPANION_DIR).`)
  process.exit(1)
}
for (const [folder, version, target] of builds) {
  const dir = join(repo, folder)
  execFileSync('./gradlew', ['build', '-q'], { cwd: dir, stdio: 'inherit' })
  copyFileSync(
    join(dir, 'build', 'libs', `craftshot-companion-1.0.0+${version}.jar`),
    join('resources', target)
  )
  console.log(`✓ ${target}`)
}
