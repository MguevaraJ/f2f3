import type { SVGProps } from 'react'

/** Line icons (24px grid, stroke = currentColor) plus a few pixel-art Minecraft glyphs. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const paths: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.2-4.2',
  filter: 'M4 5h16l-6 7.5V19l-4 1.5v-8L4 5Z',
  sort: 'M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3',
  folder:
    'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z',
  folderPlus:
    'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11ZM12 10v6m-3-3h6',
  folderOpen:
    'M3 7V5.5A1.5 1.5 0 0 1 4.5 4H9l2 2h7.5A1.5 1.5 0 0 1 20 7.5V9M3 7v11h15.5l3-9H6L3 18',
  star: 'm12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.5Z',
  trash: 'M4 7h16M9 7V4.5h6V7m-9 0 1 13h10l1-13M10 11v6m4-6v6',
  copy: 'M8 8V4.5A1.5 1.5 0 0 1 9.5 3h10A1.5 1.5 0 0 1 21 4.5v10a1.5 1.5 0 0 1-1.5 1.5H16M4.5 8h10A1.5 1.5 0 0 1 16 9.5v10a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 3 19.5v-10A1.5 1.5 0 0 1 4.5 8Z',
  cut: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm2.1-13.9L20 19M8.1 16.9 20 5',
  paste:
    'M9 4h6v3H9V4Zm-3 1.5h1.5M16.5 5.5H18A1.5 1.5 0 0 1 19.5 7v12.5A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 6 5.5M8 12h8m-8 4h5',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  refresh: 'M20 11a8 8 0 0 0-14.3-4.9L4 8m0-4v4h4m-4 5a8 8 0 0 0 14.3 4.9L20 16m0 4v-4h-4',
  close: 'M6 6l12 12M18 6 6 18',
  minimize: 'M5 12h14',
  maximize: 'M5 5h14v14H5z',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  chevronLeft: 'm15 6-6 6 6 6',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.2-4.2M11 8v6m-3-3h6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.2-4.2M8 11h6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5',
  actual: 'M4 4h16v16H4zM9 9h2v6m4-6v6',
  rotate: 'M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5',
  flip: 'M12 3v18M4 7l5 5-5 5V7Zm16 0-5 5 5 5V7Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-11v6m0-9.5v.5',
  external: 'M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
  sparkles:
    'M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  image: 'M4 5h16v14H4zM4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 18M15.5 9.5h.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  eye: 'M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  fullscreen: 'M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5',
  pipette: 'M15 4.5 19.5 9M17 3l4 4-3 3-4-4 3-3Zm-3 5-9 9v3h3l9-9',
  note: 'M5 4h14v16H5zM8.5 8.5h7m-7 4h7m-7 4h4',
  play: 'M8 5v14l11-7L8 5Z',
  hash: 'M5 9h14M5 15h14M10 4 8 20M16 4l-2 16',
  layers: 'm12 4 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5',
  upload: 'M12 20V9m0 0-4 4m4-4 4 4M5 4h14'
}

export function Icon({
  name,
  size = 18,
  ...rest
}: IconProps & { name: keyof typeof paths | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path d={paths[name] ?? paths.image} />
    </svg>
  )
}

/** Isometric grass block, the launcher's Java Edition icon. */
export function GrassBlock({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden shapeRendering="crispEdges">
      <path d="M16 2 29 9 16 16 3 9Z" fill="#6aaa3a" />
      <path
        d="M16 5l2 1-2 1-2-1zm-6 3 2 1-2 1-2-1zm12 0 2 1-2 1-2-1zm-6 4 2 1-2 1-2-1z"
        fill="#8cc751"
      />
      <path d="M3 9 16 16v14L3 23Z" fill="#8b5a2b" />
      <path d="M3 9 16 16v4L3 13Z" fill="#5c9a2c" />
      <path d="M16 16 29 9v14L16 30Z" fill="#6b4420" />
      <path d="M16 16 29 9v4l-13 7Z" fill="#4a7f22" />
      <path d="M6 16l2 1v2l-2-1zm5 5 2 1v2l-2-1zm9-3 2-1v2l-2 1zm4 3 2-1v2l-2 1z" fill="#5e3b1b" />
    </svg>
  )
}

/** 8×8 pixel creeper face for the mobs section. */
export function CreeperFace({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" aria-hidden shapeRendering="crispEdges">
      <rect width="8" height="8" fill="#5da83a" />
      <path d="M1 2h2v2H1zm4 0h2v2H5zM3 4h2v1H3zM2 5h4v2H5V6H3v1H2z" fill="#0f1a0a" />
    </svg>
  )
}

/** Tiny "F3" chip used on thumbnails. */
export function F3Badge() {
  return <span className="f3-badge">F3</span>
}
