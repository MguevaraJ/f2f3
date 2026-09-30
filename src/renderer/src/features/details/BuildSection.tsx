import { useEffect, useState } from 'react'
import { prettifyId } from '@shared/catalog/biomes'
import { FACINGS, isFacing, placeCommand, templateId, type Facing } from '@shared/placement'
import type { BuildSummary, CompanionBuild, CompanionData } from '@shared/types'
import { Icon } from '../../components/icons'
import { api } from '../../lib/api'
import { toast } from '../../store/toasts'
import { DIRECTION_ES } from '../../lib/coords'
import { CopyButton, Row, Rows, Section, SourceTag } from './parts'
import { entityName } from './TechnicalPanels'

const MATERIALS_SHOWN = 10

/** "1.234 (19 stacks + 18)": how a material list reads in the game. */
export function stacks(n: number): string {
  const full = Math.floor(n / 64)
  const rest = n % 64
  const count = n.toLocaleString('es')
  if (!full) return count
  return `${count} (${full} stack${full > 1 ? 's' : ''}${rest ? ` + ${rest}` : ''})`
}

export function materialsText(b: BuildSummary): string {
  return ['Bloque\tCantidad', ...b.materials.map((m) => `${prettifyId(m.id)}\t${m.count}`)].join(
    '\n'
  )
}

/** The area around the targeted block saved on sneak+F2 (vanilla structure .nbt). */
export function BuildSection({
  shotId,
  shotName,
  build,
  summary,
  mod
}: {
  shotId: string
  shotName: string
  build: CompanionBuild
  summary: BuildSummary | null
  mod: CompanionData
}) {
  const [all, setAll] = useState(false)
  const { size, origin } = build
  const save = async (): Promise<void> => {
    try {
      const path = await api.companion.exportBuild(shotId)
      if (path) toast.success(`Build guardado en ${path}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  const copy = async (): Promise<void> => {
    if (!summary) return
    await api.system.copyText(materialsText(summary))
    toast.success('Lista de materiales copiada')
  }
  const materials = summary
    ? all
      ? summary.materials
      : summary.materials.slice(0, MATERIALS_SHOWN)
    : []

  return (
    <Section title="Build guardado" icon="layers" action={<SourceTag source="mod" />}>
      <Rows wrap>
        <Row
          k="Área"
          v={`${size.x}×${size.y}×${size.z} desde ${origin.x} ${origin.y} ${origin.z}`}
          hint="La zona que viste en la vista previa (Mayús+F2): desde la esquina apuntada hacia el fondo, la izquierda y arriba, recortada a lo que no es aire; al pegarla también limpia el aire de dentro"
        />
        <Row k="Bloques" v={`${build.blocks.toLocaleString('es')} (sin contar el aire)`} />
        {summary && summary.blockEntities > 0 && (
          <Row
            k="Con datos"
            v={`${summary.blockEntities} (cofres, hornos, carteles… con su contenido)`}
          />
        )}
        {summary && summary.entities.length > 0 && (
          <Row
            k="Entidades"
            v={summary.entities.map((e) => `${e.count} × ${entityName(e.id)}`).join(', ')}
          />
        )}
      </Rows>

      {summary ? (
        <div className="block-state">
          <div className="mobs-head">
            <Icon name="list" size={15} /> Materiales
            <span className="muted small"> · {summary.materials.length} tipos de bloque</span>
          </div>
          <ol className="materials">
            {materials.map((m) => (
              <li key={m.id} title={m.id}>
                <span>{prettifyId(m.id)}</span>
                <b>{stacks(m.count)}</b>
              </li>
            ))}
          </ol>
          {summary.materials.length > MATERIALS_SHOWN && (
            <button className="f3-tip-toggle" onClick={() => setAll(!all)} aria-expanded={all}>
              <u>{all ? 'Ver menos' : `Ver los ${summary.materials.length} materiales`}</u>
            </button>
          )}
        </div>
      ) : (
        <p className="muted small">
          No se encontró el archivo <code>.craftshot.nbt</code> junto a la captura.
        </p>
      )}

      {summary && (
        <div className="build-actions">
          <button className="btn small" onClick={() => void save()}>
            <Icon name="download" size={14} /> Guardar .nbt…
          </button>
          <button className="btn small" onClick={() => void copy()}>
            <Icon name="copy" size={14} /> Copiar materiales
          </button>
        </div>
      )}
      {summary && <PlaceBlock shotId={shotId} shotName={shotName} build={build} mod={mod} />}
      <p className="muted small">
        Litematica lo abre desde «Cargar esquemas» (el botón «Guardar .nbt…» propone su carpeta{' '}
        <code>.minecraft/schematics</code>).
      </p>
    </Section>
  )
}

/**
 * Puts the build back in a world where it was relative to the player: copies it into the
 * world and gives the /place command for the way the player is facing now.
 */
function PlaceBlock({
  shotId,
  shotName,
  build,
  mod
}: {
  shotId: string
  shotName: string
  build: CompanionBuild
  mod: CompanionData
}) {
  const [saves, setSaves] = useState<{ folder: string; name: string }[] | null>(null)
  const [folder, setFolder] = useState('')
  const [installed, setInstalled] = useState<string | null>(null)
  const then: Facing = isFacing(mod.player.facing.direction) ? mod.player.facing.direction : 'north'
  const [now, setNow] = useState<Facing>(then)

  useEffect(() => {
    let alive = true
    void api.companion.listSaves().then((list) => {
      if (!alive) return
      setSaves(list)
      // The world the screenshot comes from, when its name matches.
      // With the build already in its world, suggest another one.
      const own = list.find((w) => w.name === mod.world.name)
      const pick = build.template ? (list.find((w) => w !== own) ?? own) : (own ?? list[0])
      setFolder(pick?.folder ?? '')
    })
    return () => {
      alive = false
    }
  }, [mod.world.name, build.template])

  const id = build.template ?? templateId(shotName)
  const inWorld = !!build.template
  const command = placeCommand(id, build.origin, mod.player.block, then, now)
  const dup = (name: string): boolean => (saves ?? []).filter((w) => w.name === name).length > 1

  const install = async (): Promise<void> => {
    try {
      await api.companion.installBuild(shotId, folder, build.template)
      setInstalled(folder)
      toast.success('Build añadido al mundo')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="block-state place-block">
      <div className="mobs-head">
        <Icon name="pin" size={15} /> Pegarlo donde estaba
      </div>
      <p className="muted small">
        Aparece en el mismo sitio respecto a ti: misma distancia, altura y lado. Colócate donde
        quieras y ejecuta el comando (hacen falta trucos activados).
      </p>
      {inWorld && (
        <p className="small">
          Ya está en el mundo «{mod.world.name}» como <code>{id}</code>. En el juego, escribe{' '}
          <code>/place template craftshot:</code> y el juego te sugiere todos tus builds.
        </p>
      )}
      {saves && saves.length > 0 ? (
        <div className="place-row">
          <select
            className="input small-select"
            value={folder}
            onChange={(e) => {
              setFolder(e.target.value)
              setInstalled(null)
            }}
            aria-label="Mundo"
          >
            {saves.map((w) => (
              <option key={w.folder} value={w.folder}>
                {w.name}
                {dup(w.name) || w.name !== w.folder ? ` (${w.folder})` : ''}
              </option>
            ))}
          </select>
          <button className="btn small" onClick={() => void install()}>
            <Icon name={installed === folder ? 'check' : 'folder'} size={14} />{' '}
            {installed === folder ? 'Añadido' : inWorld ? 'Añadir a otro mundo' : 'Añadir al mundo'}
          </button>
        </div>
      ) : (
        saves && <p className="muted small">No se encontraron mundos en .minecraft/saves.</p>
      )}
      <div className="place-row">
        <span className="small">Mirando al</span>
        <div className="segmented">
          {FACINGS.map((f) => (
            <button
              key={f}
              className={f === now ? 'on' : ''}
              onClick={() => setNow(f)}
              title={f === then ? 'Como en la captura' : undefined}
            >
              {DIRECTION_ES[f]}
              {f === then ? ' •' : ''}
            </button>
          ))}
        </div>
      </div>
      <CopyButton label="Comando" value={command} />
      <p className="muted small">
        • = hacia donde mirabas en la captura. Si miras a otro lado, elige esa dirección (en el F3
        aparece como «Facing») y el build gira contigo. Si probaste el comando antes de añadirlo,
        sal y vuelve a entrar al mundo: el juego recuerda que no existía.
      </p>
    </div>
  )
}
