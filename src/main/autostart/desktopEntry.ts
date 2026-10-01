import { tr } from '@shared/i18n'
/**
 * XDG autostart entry (freedesktop "Desktop Entry" spec), honoured by GNOME, KDE,
 * XFCE, Cinnamon… and by i3/sway setups that run `dex -a`.
 */

/** Quotes one Exec argument per the Desktop Entry spec. */
export function quoteExecArg(arg: string): string {
  if (!/[\s"'`$\\<>~|&;*?#()]/.test(arg) && arg !== '') return arg
  return `"${arg.replace(/(["`$\\])/g, '\\$1')}"`
}

export function execLine(argv: string[]): string {
  // "%" introduces field codes in Exec, so literal ones must be doubled.
  return argv.map(quoteExecArg).join(' ').replace(/%/g, '%%')
}

export function desktopEntry(opts: { argv: string[]; icon: string }): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=F2+F3',
    tr('Comment=Avisos y respaldo de tus capturas de Minecraft'),
    `Exec=${execLine(opts.argv)}`,
    `Icon=${opts.icon}`,
    'Terminal=false',
    'Categories=Graphics;Game;',
    'X-GNOME-Autostart-enabled=true',
    ''
  ].join('\n')
}
