import { planBackup, sourceName, type LocalFile, type RemoteFile } from '../src/core/backup/plan'

const L = (path: string, md5: string): LocalFile => ({ path, md5, size: 10 })
const R = (id: string, path: string, md5: string): RemoteFile => ({ id, path, md5, size: 10 })

describe('backup planning', () => {
  it('skips identical files, uploads new ones and updates changed content', () => {
    const plan = planBackup(
      [L('a.png', '1'), L('b.png', '2'), L('c.png', 'new')],
      [R('x', 'a.png', '1'), R('y', 'c.png', 'old')]
    )
    expect(plan.actions.map((a) => [a.kind, a.local.path])).toEqual([
      ['skip', 'a.png'],
      ['upload', 'b.png'],
      ['update', 'c.png']
    ])
  })

  it('turns a local rename/move into a Drive move instead of a re-upload', () => {
    const plan = planBackup([L('Bases/granja.png', 'h')], [R('x', '2026-09-20_05.19.44.png', 'h')])
    expect(plan.actions).toEqual([
      {
        kind: 'move',
        local: L('Bases/granja.png', 'h'),
        remote: R('x', '2026-09-20_05.19.44.png', 'h')
      }
    ])
    expect(plan.remoteOnly).toEqual([])
  })

  it('never reuses one Drive file for two local copies', () => {
    const plan = planBackup([L('a/x.png', 'h'), L('b/x.png', 'h')], [R('1', 'x.png', 'h')])
    expect(plan.actions.map((a) => a.kind).sort()).toEqual(['move', 'upload'])
  })

  it('keeps files that only exist in Drive (a backup never deletes)', () => {
    const plan = planBackup([L('a.png', '1')], [R('x', 'a.png', '1'), R('y', 'borrada.png', '9')])
    expect(plan.remoteOnly.map((r) => r.path)).toEqual(['borrada.png'])
  })

  it('lists the folders to create, parents first', () => {
    const plan = planBackup([L('Nether/Bastiones/b.png', '1'), L('Bases/a.png', '2')], [])
    expect(plan.folders).toEqual(['', 'Bases', 'Nether', 'Nether/Bastiones'])
  })

  it('names the Drive folder after the install or instance', () => {
    expect(sourceName('/home/moises/.minecraft/screenshots')).toBe('minecraft')
    expect(sourceName('C:/Users/Moises/AppData/Roaming/.minecraft/screenshots')).toBe('minecraft')
    expect(
      sourceName('/home/m/.local/share/PrismLauncher/instances/Fabric 1.21/.minecraft/screenshots')
    ).toBe('Fabric 1.21')
    expect(sourceName('/home/m/.local/share/ModrinthApp/profiles/Tecnico/screenshots')).toBe(
      'Tecnico'
    )
  })
})
