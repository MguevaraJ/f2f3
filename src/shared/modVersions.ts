/** Version of the mod bundled with the app (the three jars in resources/). */
export const MOD_RELEASE = '1.0.1'

/** Minecraft versions the F2+F3 Companion mod is built for (Fabric), newest first. */
export const MOD_VERSIONS = ['26.3', '1.21.1', '1.20.1'] as const

export type ModVersion = (typeof MOD_VERSIONS)[number]

export const isModVersion = (v: unknown): v is ModVersion => MOD_VERSIONS.includes(v as ModVersion)
