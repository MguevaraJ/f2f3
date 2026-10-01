import { useState } from 'react'
import { prettifyId } from '@shared/catalog/biomes'
import { mobName } from '@shared/catalog/mobs'
import { enchantmentName, professionName, villagerLevelName } from '@shared/catalog/villagers'
import { companionTechnical } from '@shared/companion'
import type {
  CompanionData,
  CompanionItem,
  CompanionVillager,
  F3Data,
  TargetedBlock
} from '@shared/types'
import { CreeperFace, Icon } from '../../components/icons'
import { formatNumber } from '../../lib/format'
import {
  blockStateString,
  capRows,
  HEIGHTMAP_LABEL,
  setblockCommand,
  tickInfo
} from '../../lib/technical'
import { CopyButton, Row, Rows, Section, SourceTag } from './parts'
import { tr } from '@shared/i18n'

const ENTITY_LABEL: Record<string, string> = {
  'minecraft:item': tr('Ítems sueltos'),
  'minecraft:experience_orb': tr('Orbes de experiencia'),
  'minecraft:arrow': tr('Flechas'),
  'minecraft:falling_block': tr('Bloques cayendo'),
  'minecraft:tnt': tr('TNT encendida'),
  'minecraft:minecart': tr('Vagonetas'),
  'minecraft:hopper_minecart': tr('Vagonetas con tolva'),
  'minecraft:chest_minecart': tr('Vagonetas con cofre'),
  'minecraft:armor_stand': tr('Soportes de armadura'),
  'minecraft:item_frame': tr('Marcos'),
  'minecraft:player': tr('Jugadores')
}
export const entityName = (id: string): string => ENTITY_LABEL[id] ?? mobName(id)

export function itemLabel(item: CompanionItem): string {
  const ench = Object.entries(item.enchantments ?? {})
    .map(([id, lvl]) => enchantmentName(id, lvl))
    .join(', ')
  const name = prettifyId(item.id)
  return `${item.count > 1 ? `${item.count} × ` : ''}${name}${ench ? ` (${ench})` : ''}`
}

/** Redstone, farms and lag: from the mod (exact, singleplayer) and the debug screen. */
export function TechnicalSection({
  f3,
  mod,
  target
}: {
  f3: F3Data | null
  mod: CompanionData | null
  target?: TargetedBlock
}) {
  const [showTags, setShowTags] = useState(false)
  const [showNearby, setShowNearby] = useState(false)
  const fromMod = mod ? companionTechnical(mod) : {}
  const server = fromMod.server ?? f3?.server
  const tick = server && tickInfo(server)
  const spawn = fromMod.spawnCounts ?? f3?.spawnCounts
  const caps = spawn ? capRows(spawn) : []
  const heights = f3?.heightmaps?.server ?? f3?.heightmaps?.client
  const modBlock = mod?.target.block
  const blockExtra =
    modBlock &&
    target &&
    modBlock.pos.x === target.pos.x &&
    modBlock.pos.y === target.pos.y &&
    modBlock.pos.z === target.pos.z
      ? modBlock
      : undefined
  const hasState = !!target && (!!target.state || !!target.tags || !!blockExtra)
  const nearby = mod?.nearby ?? []
  const nearbyTotal = nearby.reduce((n, e) => n + e.count, 0)
  const items = nearby.find((e) => e.id === 'minecraft:item')?.count ?? 0

  if (
    !server &&
    !caps.length &&
    !hasState &&
    f3?.day === undefined &&
    f3?.speed === undefined &&
    !heights &&
    !nearby.length
  )
    return null
  const state = target && blockStateString(target)
  const setblock = target && setblockCommand(target)

  return (
    <Section
      title={tr('Técnico')}
      icon="gauge"
      action={<SourceTag source={fromMod.server || fromMod.spawnCounts ? 'mod' : 'f3'} />}
    >
      <Rows wrap>
        {tick && (
          <Row
            k={tr('Servidor')}
            v={tr(
              '{0} ms/tick · {1} TPS · {2}',
              formatNumber(server!.mspt!, 1),
              formatNumber(tick.tps, 1),
              tick.label
            )}
            hint={tr(
              'MSPT: milisegundos por tick. Por encima del objetivo (50 ms a 20 TPS) el juego va lento.'
            )}
          />
        )}
        {server && !tick && server.targetMs && Math.round(1000 / server.targetMs) !== 20 && (
          <Row
            k={tr('Velocidad del tick')}
            v={tr('{0} ticks/s (/tick rate)', formatNumber(1000 / server.targetMs, 1))}
          />
        )}
        {server?.brand && <Row k={tr('Servidor')} v={server.brand} />}
        {f3?.day !== undefined && !mod && <Row k={tr('Día del mundo')} v={String(f3.day)} />}
        {f3?.speed !== undefined && (
          <Row
            k={tr('Velocidad')}
            v={tr(
              '{0} bloques/tick ({1} m/s)',
              formatNumber(f3.speed, 3),
              formatNumber(f3.speed * 20, 2)
            )}
          />
        )}
        {heights && (
          <Row
            k={tr('Alturas')}
            v={Object.entries(heights)
              .map(([k, y]) => `${HEIGHTMAP_LABEL[k] ?? k} ${y}`)
              .join(' · ')}
            hint={tr('Heightmaps del servidor: el bloque más alto de cada tipo en esta columna')}
          />
        )}
      </Rows>

      {caps.length > 0 && (
        <div className="mob-caps">
          <div className="mobs-head">
            <CreeperFace size={16} /> {tr('Límite de mobs')}
            <span className="muted small">
              {' '}
              · {spawn!.chunks} {tr('chunks de spawn')}
            </span>
          </div>
          {caps.map((c) => (
            <div key={c.id} className={`cap-row ${c.full ? 'full' : ''}`} title={c.hint}>
              <span className="cap-label">{c.label}</span>
              <span className="cap-bar">
                <span
                  style={{ width: `${Math.min(100, (c.count / Math.max(1, c.cap)) * 100)}%` }}
                />
              </span>
              <span className="cap-value">
                {c.count}/{c.cap}
              </span>
            </div>
          ))}
          {caps.find((c) => c.id === 'monster')?.full && (
            <p className="muted small">
              {tr(
                'El límite de monstruos está lleno: no aparecerán más hostiles. Ilumina cuevas cercanas o elimina mobs persistentes para que tu granja rinda.'
              )}
            </p>
          )}
        </div>
      )}

      {nearby.length > 0 && (
        <div className="block-state">
          <div className="mobs-head">
            <Icon name="eye" size={15} /> {tr('Entidades cargadas a 128 bloques')}
            <span className="muted small"> · {nearbyTotal}</span>
          </div>
          <div className="chip-row">
            {(showNearby ? nearby : nearby.slice(0, 8)).map((e) => (
              <span key={e.id} className="chip" title={e.id}>
                {entityName(e.id)} <b>×{e.count}</b>
              </span>
            ))}
            {nearby.length > 8 && (
              <button className="f3-tip-toggle" onClick={() => setShowNearby(!showNearby)}>
                <u>{showNearby ? tr('Menos') : tr('+{0} tipos', nearby.length - 8)}</u>
              </button>
            )}
          </div>
          {items >= 200 && (
            <p className="muted small">
              {tr('Hay')} {items}{' '}
              {tr('ítems sueltos cerca: muchas entidades de ítem suelen causar lag.')}
            </p>
          )}
        </div>
      )}

      {target && hasState && (
        <div className="block-state">
          <div className="mobs-head">
            <Icon name="layers" size={15} /> {target.id ?? tr('Bloque apuntado')}
          </div>
          {target.state && (
            <div className="chip-row">
              {Object.entries(target.state).map(([k, v]) => (
                <span
                  key={k}
                  className={`chip state ${v === 'true' ? 'on' : v === 'false' ? 'off' : ''}`}
                >
                  {k} <b>{v}</b>
                </span>
              ))}
            </div>
          )}
          {blockExtra?.signal && (
            <Rows wrap>
              <Row k={tr('Señal de redstone recibida')} v={String(blockExtra.signal.received)} />
              {blockExtra.signal.comparatorOutput !== undefined && (
                <Row
                  k={tr('Salida del comparador')}
                  v={String(blockExtra.signal.comparatorOutput)}
                />
              )}
              {blockExtra.signal.containerSignal !== undefined && (
                <Row
                  k={tr('Un comparador leería')}
                  v={String(blockExtra.signal.containerSignal)}
                  hint={tr(
                    'Señal que da un comparador leyendo este contenedor (depende de lo lleno que está)'
                  )}
                />
              )}
            </Rows>
          )}
          {blockExtra?.container && (
            <>
              <div className="muted small">
                {tr('Contenido:')} {blockExtra.container.items.length}/{blockExtra.container.size}{' '}
                {tr('ranuras ocupadas')}
              </div>
              {blockExtra.container.items.length > 0 && (
                <div className="chip-row">
                  {blockExtra.container.items.map((it) => (
                    <span
                      key={it.slot}
                      className="chip"
                      title={tr('Ranura {0} · {1}', it.slot, it.id)}
                    >
                      {itemLabel(it)}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="copy-grid">
            {state && <CopyButton label={tr('Estado')} value={state} />}
            {setblock && <CopyButton label="/setblock" value={setblock} />}
          </div>
          {target.tags && (
            <>
              <button
                className="f3-tip-toggle"
                onClick={() => setShowTags(!showTags)}
                aria-expanded={showTags}
              >
                <u>
                  {showTags ? tr('Ocultar') : tr('Ver')} {target.tags.length} {tr('etiquetas')}
                </u>
              </button>
              {showTags && (
                <div className="chip-row">
                  {target.tags.map((t) => (
                    <span key={t} className="chip tag">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Section>
  )
}

const posText = (p: { x: number; y: number; z: number }): string => `${p.x} ${p.y} ${p.z}`

/** The villager in the crosshair: job, level, bonds and trades (trading halls, iron farms). */
export function VillagerSection({ v }: { v: CompanionVillager }) {
  return (
    <Section title={tr('Aldeano')} icon="note" action={<SourceTag source="mod" />}>
      <Rows wrap>
        {v.profession && (
          <Row
            k={tr('Profesión')}
            v={`${professionName(v.profession)}${v.level ? ` · ${villagerLevelName(v.level)} (${v.level})` : ''}`}
          />
        )}
        {v.xp !== undefined && (
          <Row
            k={tr('Experiencia')}
            v={v.xp === 0 ? tr('0 · aún se puede cambiar su oficio') : String(v.xp)}
            hint={tr(
              'Con 0 de experiencia, romper su estación de trabajo le vuelve a sortear los tratos'
            )}
          />
        )}
        {v.jobSite && <Row k={tr('Estación de trabajo')} v={posText(v.jobSite)} />}
        {v.home && <Row k={tr('Cama')} v={posText(v.home)} />}
        {v.meetingPoint && <Row k={tr('Campana')} v={posText(v.meetingPoint)} />}
        {v.golemDetectedRecently !== undefined && (
          <Row
            k={tr('Vio un gólem hace poco')}
            v={v.golemDetectedRecently ? tr('Sí (no invocará otro por ahora)') : tr('No')}
            hint={tr('Los aldeanos solo invocan gólems si no han visto uno recientemente')}
          />
        )}
      </Rows>
      {v.trades.length > 0 && (
        <div className="trades">
          {v.trades.map((t, i) => (
            <div
              key={i}
              className={`trade ${t.uses >= t.maxUses ? 'out' : ''}`}
              title={t.uses >= t.maxUses ? tr('Agotado') : tr('{0}/{1} usos', t.uses, t.maxUses)}
            >
              <span>{t.buy.map(itemLabel).join(' + ')}</span>
              <Icon name="chevronRight" size={14} />
              <b>{itemLabel(t.sell)}</b>
              <span className="muted small">
                {t.uses}/{t.maxUses}
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

/** Game rules for technical play; the ones changed from the default stand out. */
const KEY_RULES: Record<string, string> = {
  'minecraft:random_tick_speed': tr('Velocidad de ticks aleatorios'),
  'minecraft:spawn_mobs': tr('Aparición de mobs'),
  'minecraft:spawn_monsters': tr('Aparición de monstruos'),
  'minecraft:advance_time': tr('Ciclo de día y noche'),
  'minecraft:advance_weather': tr('Ciclo del clima'),
  'minecraft:mob_griefing': tr('Mobs rompen bloques'),
  'minecraft:keep_inventory': tr('Conservar inventario'),
  'minecraft:max_entity_cramming': tr('Máximo de entidades apiladas'),
  'minecraft:players_sleeping_percentage': tr('Jugadores durmiendo (%)'),
  'minecraft:spawn_phantoms': tr('Aparición de phantoms'),
  'minecraft:spawn_patrols': tr('Patrullas de saqueadores'),
  'minecraft:raids': tr('Invasiones'),
  'minecraft:spawn_wandering_traders': tr('Comerciante nómada'),
  'minecraft:tnt_explodes': tr('La TNT explota')
}

const ruleText = (v: boolean | number | string): string =>
  v === true ? tr('sí') : v === false ? 'no' : String(v)

export function GameRulesBlock({ rules }: { rules: NonNullable<CompanionData['gamerules']> }) {
  const [all, setAll] = useState(false)
  const entries = Object.entries(rules)
  const changed = entries.filter(([, r]) => r.value !== r.default)
  const shown = all ? entries : entries.filter(([id, r]) => KEY_RULES[id] || r.value !== r.default)
  return (
    <div className="block-state">
      <div className="mobs-head">
        <Icon name="gear" size={15} /> {tr('Reglas del juego')}
        <span className="muted small">
          {' '}
          · {changed.length ? tr('{0} cambiadas', changed.length) : tr('todas por defecto')}
        </span>
      </div>
      <Rows wrap>
        {shown.map(([id, r]) => (
          <Row
            key={id}
            k={KEY_RULES[id] ?? prettifyId(id)}
            v={`${ruleText(r.value)}${r.value !== r.default ? tr(' (por defecto: {0})', ruleText(r.default)) : ''}`}
            hint={id}
          />
        ))}
      </Rows>
      <button className="f3-tip-toggle" onClick={() => setAll(!all)} aria-expanded={all}>
        <u>{all ? tr('Ver solo las importantes') : tr('Ver las {0} reglas', entries.length)}</u>
      </button>
    </div>
  )
}

export function ModsBlock({ mods }: { mods: NonNullable<CompanionData['mods']> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="block-state">
      <button className="f3-tip-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <u>
          {open ? tr('Ocultar') : tr('Ver')} {mods.length} {tr('mods instalados')}
        </u>
      </button>
      {open && (
        <div className="chip-row">
          {mods.map((m) => (
            <span key={m.id} className="chip tag" title={m.id}>
              {m.name} {m.version}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
