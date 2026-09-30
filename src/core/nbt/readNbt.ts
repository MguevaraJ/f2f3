import { gunzipSync } from 'fflate'

/**
 * Minimal reader for Minecraft's NBT (big-endian, usually gzipped) as plain JS values:
 * compounds → objects, lists and arrays → arrays, longs → bigint. Pure.
 */
export type NbtValue =
  | number
  | bigint
  | string
  | NbtValue[]
  | Int8Array
  | Int32Array
  | BigInt64Array
  | { [key: string]: NbtValue }

export type NbtCompound = { [key: string]: NbtValue }

const MAX_DEPTH = 512

class Reader {
  private pos = 0
  private readonly view: DataView
  private readonly text = new TextDecoder()

  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  }

  private need(n: number): number {
    if (this.pos + n > this.buf.length) throw new Error('NBT truncado')
    const at = this.pos
    this.pos += n
    return at
  }
  u8 = (): number => this.view.getInt8(this.need(1))
  i16 = (): number => this.view.getInt16(this.need(2))
  u16 = (): number => this.view.getUint16(this.need(2))
  i32 = (): number => this.view.getInt32(this.need(4))
  i64 = (): bigint => this.view.getBigInt64(this.need(8))
  f32 = (): number => this.view.getFloat32(this.need(4))
  f64 = (): number => this.view.getFloat64(this.need(8))
  // Java's modified UTF-8 matches UTF-8 except for NUL and supplementary characters.
  str = (): string => {
    const n = this.u16()
    const at = this.need(n)
    return this.text.decode(this.buf.subarray(at, at + n))
  }
  count = (): number => {
    const n = this.i32()
    if (n < 0 || n > this.buf.length - this.pos + 1) throw new Error('NBT: longitud no válida')
    return n
  }

  payload(type: number, depth: number): NbtValue {
    if (depth > MAX_DEPTH) throw new Error('NBT demasiado anidado')
    switch (type) {
      case 1:
        return this.u8()
      case 2:
        return this.i16()
      case 3:
        return this.i32()
      case 4:
        return this.i64()
      case 5:
        return this.f32()
      case 6:
        return this.f64()
      case 7: {
        const n = this.count()
        const at = this.need(n)
        return new Int8Array(this.buf.slice(at, at + n).buffer)
      }
      case 8:
        return this.str()
      case 9: {
        const inner = this.u8()
        const n = this.count()
        const out: NbtValue[] = []
        for (let i = 0; i < n; i++) out.push(this.payload(inner, depth + 1))
        return out
      }
      case 10: {
        const out: NbtCompound = {}
        for (;;) {
          const t = this.u8()
          if (t === 0) return out
          out[this.str()] = this.payload(t, depth + 1)
        }
      }
      case 11: {
        const n = this.count()
        const out = new Int32Array(n)
        for (let i = 0; i < n; i++) out[i] = this.i32()
        return out
      }
      case 12: {
        const n = this.count()
        const out = new BigInt64Array(n)
        for (let i = 0; i < n; i++) out[i] = this.i64()
        return out
      }
      default:
        throw new Error(`NBT: tipo desconocido ${type}`)
    }
  }

  root(): NbtCompound {
    const t = this.u8()
    if (t !== 10) throw new Error('NBT: la raíz no es un compuesto')
    this.str()
    return this.payload(10, 0) as NbtCompound
  }
}

/** Parses an NBT file (gzipped or not) whose root is a compound. */
export function readNbt(data: Uint8Array): NbtCompound {
  const raw = data[0] === 0x1f && data[1] === 0x8b ? gunzipSync(data) : data
  return new Reader(raw).root()
}
