import { describe, expect, it } from 'vitest'
import { mergeGamePlans } from '../src/shared/gamePlans'

const afk = {
  dimension: 'minecraft:overworld',
  spot: { x: 10, y: 70, z: -5 },
  kind: 'mobs',
  simulation: 12,
  farms: [{ x: 60, y: 40, z: -5, label: 'Creepers', level: 'ok', text: 'Funciona' }]
}
const portals = { aDim: 'minecraft:overworld', a: { x: 800, y: 64, z: 80 }, b: null }

describe('mergeGamePlans', () => {
  it('adds a world keeping the others', () => {
    const first = mergeGamePlans(null, 'Uno', { afk })
    const both = mergeGamePlans(first, 'Dos', { portals, seed: '123' })
    expect(Object.keys(both.worlds)).toEqual(['Uno', 'Dos'])
    expect(both.worlds.Uno.afk).toEqual(afk)
    expect(both.worlds.Dos).toEqual({ seed: '123', portals })
  })

  it('keeps the keys a patch does not name and removes the null ones', () => {
    const full = mergeGamePlans(null, 'Uno', { afk, portals })
    const noAfk = mergeGamePlans(full, 'Uno', { afk: null })
    expect(noAfk.worlds.Uno).toEqual({ portals })
    expect(mergeGamePlans(noAfk, 'Uno', { portals: null }).worlds).toEqual({})
  })

  it('drops whatever is malformed', () => {
    const plans = mergeGamePlans(
      { worlds: { Roto: { afk: { spot: 'x' } }, Uno: { afk } } },
      'Dos',
      {
        seed: 'abc',
        afk: { ...afk, simulation: 99, farms: [{ x: 1, z: 2, level: 'raro' }, 'nada'] }
      }
    )
    expect(Object.keys(plans.worlds)).toEqual(['Uno', 'Dos'])
    expect(plans.worlds.Dos.seed).toBeUndefined()
    expect(plans.worlds.Dos.afk?.simulation).toBe(32)
    expect(plans.worlds.Dos.afk?.farms).toEqual([
      { x: 1, y: null, z: 2, label: '', level: 'bad', text: '' }
    ])
  })
})
