/**
 * electron-builder afterPack hook: trims onnxruntime-node (used by the on-device
 * model) down to the CPU runtime of the target platform/arch. Upstream ships every
 * platform plus CUDA/TensorRT providers (~550 MB); the app only needs ~45 MB.
 */
const { existsSync, readdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')

const PLATFORM = { linux: 'linux', windows: 'win32', mac: 'darwin' }
const ARCH = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }

exports.default = async function afterPack(context) {
  const resources =
    context.electronPlatformName === 'darwin'
      ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : join(context.appOutDir, 'resources')
  const bin = join(resources, 'app.asar.unpacked', 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6')
  if (!existsSync(bin)) return
  const platform = PLATFORM[context.packager.platform.name] ?? context.electronPlatformName
  const arch = ARCH[context.arch] ?? 'x64'
  for (const p of readdirSync(bin)) {
    if (p !== platform) {
      rmSync(join(bin, p), { recursive: true, force: true })
      continue
    }
    for (const a of readdirSync(join(bin, p))) {
      const dir = join(bin, p, a)
      if (a !== arch && arch !== 'universal') {
        rmSync(dir, { recursive: true, force: true })
        continue
      }
      for (const f of readdirSync(dir))
        if (/cuda|tensorrt|dml|migraphx|rocm/i.test(f)) rmSync(join(dir, f), { force: true })
    }
  }
}
