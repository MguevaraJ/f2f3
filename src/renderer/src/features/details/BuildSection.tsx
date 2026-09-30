import { useState } from 'react'
import { prettifyId } from '@shared/catalog/biomes'
import type { BuildSummary, CompanionBuild } from '@shared/types'
import { Icon } from '../../components/icons'
import { api } from '../../lib/api'
import { toast } from '../../store/toasts'
import { Row, Rows, Section, SourceTag } from './parts'
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
  build,
  summary
}: {
  shotId: string
  build: CompanionBuild
  summary: BuildSummary | null
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
          hint="La zona que viste en la vista previa (Mayús+F2): desde el bloque apuntado hacia arriba, recortada a lo que no es aire; al pegarla también limpia el aire de dentro"
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
      <p className="muted small">
        Litematica lo abre desde «Cargar esquemas» (se guarda por defecto en{' '}
        <code>.minecraft/schematics</code>). En el juego: cópialo como{' '}
        <code>saves/&lt;mundo&gt;/generated/minecraft/structure/&lt;nombre&gt;.nbt</code> y usa{' '}
        <code>/place template minecraft:&lt;nombre&gt;</code> o un bloque de estructura.
      </p>
    </Section>
  )
}
