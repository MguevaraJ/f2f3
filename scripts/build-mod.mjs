// Builds the F2+F3 Companion mod (its own repository, next to this one) for every
// Minecraft version and copies the jars into resources/, where the app bundles them.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repo = resolve(process.env.F2F3_COMPANION_DIR ?? '../f2f3-companion')
// [project folder, Minecraft version, jar in resources/]
const builds = [
  ['fabric-26.3', '26.3', 'f2f3-companion.jar'],
  ['fabric-1.21.1', '1.21.1', 'f2f3-companion-1.21.1.jar'],
  ['fabric-1.20.1', '1.20.1', 'f2f3-companion-1.20.1.jar']
]

if (!existsSync(repo)) {
  console.error(`No se encontró el repositorio del mod en ${repo} (define F2F3_COMPANION_DIR).`)
  process.exit(1)
}
for (const [folder, version, target] of builds) {
  const dir = join(repo, folder)
  // The mod's own version, from its gradle.properties.
  const release = readFileSync(join(dir, 'gradle.properties'), 'utf8')
    .match(/^version=(.+)$/m)[1]
    .trim()
  execFileSync('./gradlew', ['build', '-q'], { cwd: dir, stdio: 'inherit' })
  copyFileSync(
    join(dir, 'build', 'libs', `f2f3-companion-${release}+${version}.jar`),
    join('resources', target)
  )
  console.log(`✓ ${target}`)
}
