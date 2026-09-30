import { describe, expect, it } from 'vitest'
import { xaeroDimFolder, xaeroFiles, xaeroLine } from '../src/core/export/xaero'

describe("Xaero's Minimap waypoints", () => {
  it('writes the 14 fields in the mod order, escaping colons', () => {
    expect(
      xaeroLine({
        name: 'Granja: hierro',
        x: -1020.7,
        y: 64,
        z: 33.2,
        dimension: 'minecraft:overworld',
        color: 6
      })
    ).toBe('waypoint:Granja§§ hierro:G:-1021:64:33:6:false:0:gui.xaero_default:false:0:0:false')
  })

  it('uses the dimension folders Xaero expects', () => {
    expect(xaeroDimFolder('minecraft:overworld')).toBe('dim%0')
    expect(xaeroDimFolder('minecraft:the_nether')).toBe('dim%-1')
    expect(xaeroDimFolder('minecraft:the_end')).toBe('dim%1')
    expect(xaeroDimFolder('mymod:sky/world')).toBe('dim%mymod$sky%fs%world')
  })

  it('groups waypoints into one file per dimension with the header', () => {
    const files = xaeroFiles([
      { name: 'a', x: 0, y: 0, z: 0, dimension: 'minecraft:overworld' },
      { name: 'b', x: 1, y: 1, z: 1, dimension: 'minecraft:the_nether' },
      { name: 'c', x: 2, y: 2, z: 2, dimension: 'minecraft:overworld' }
    ])
    expect(Object.keys(files).sort()).toEqual(['dim%-1/mw$default_1.txt', 'dim%0/mw$default_1.txt'])
    const ow = files['dim%0/mw$default_1.txt'].split('\n')
    expect(ow[0]).toBe('sets:gui.xaero_default')
    expect(ow[2]).toMatch(/^#waypoint:name:initials:x:y:z:color/)
    expect(ow.filter((l) => l.startsWith('waypoint:'))).toHaveLength(2)
  })
})
