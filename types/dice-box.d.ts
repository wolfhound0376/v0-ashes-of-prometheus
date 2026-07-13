// Minimal ambient declaration for @3d-dice/dice-box (ships no types).
// Covers only the surface we use in components/dashboard/dice-roller.tsx.
declare module "@3d-dice/dice-box" {
  export interface DieResult {
    groupId: number
    rollId: number
    sides: number
    /** The authoritative rolled value produced by the physics simulation. */
    value: number
    theme?: string
    themeColor?: string
  }

  export interface DiceBoxConfig {
    id?: string
    assetPath: string
    container?: string
    theme?: string
    themeColor?: string
    scale?: number
    gravity?: number
    mass?: number
    friction?: number
    restitution?: number
    angularDamping?: number
    linearDamping?: number
    spinForce?: number
    throwForce?: number
    startingHeight?: number
    settleTimeout?: number
    offscreen?: boolean
    lightIntensity?: number
    enableShadows?: boolean
    shadowTransparency?: number
    onRollComplete?: (results: DieResult[]) => void
    onDieComplete?: (result: DieResult) => void
  }

  export type DiceNotation = string | string[] | { qty: number; sides: number }

  export default class DiceBox {
    constructor(config: DiceBoxConfig)
    init(): Promise<void>
    roll(notation: DiceNotation, options?: { theme?: string; newStartPoint?: boolean }): Promise<DieResult[]>
    add(notation: DiceNotation, options?: { newStartPoint?: boolean }): Promise<DieResult[]>
    clear(): void
    hide(className?: string): void
    show(): void
    getRollResults(): DieResult[]
    updateConfig(config: Partial<DiceBoxConfig>): void
  }
}
