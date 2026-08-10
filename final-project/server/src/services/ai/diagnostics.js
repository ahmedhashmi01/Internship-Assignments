// Carries provider-chain routing metadata (selected provider/model, fallback
// index, attempted providers, etc.) alongside a plain return value WITHOUT
// changing its shape — stored non-enumerably, so it's invisible to
// JSON.stringify, object spread, and toEqual/toMatchObject assertions, but
// still directly readable by anything that explicitly asks for it.
const DIAGNOSTICS_KEY = '__aiDiagnostics'

export const attachDiagnostics = (target, diagnostics) => {
  if (target && typeof target === 'object' && diagnostics) {
    try {
      Object.defineProperty(target, DIAGNOSTICS_KEY, { value: diagnostics, enumerable: false, configurable: true })
    } catch {
      // Non-extensible target (rare) — diagnostics just won't be attached.
    }
  }
  return target
}

export const readDiagnostics = (source) => (source && typeof source === 'object' ? source[DIAGNOSTICS_KEY] : undefined)
