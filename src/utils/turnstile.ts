type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  execute: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Die Sicherheitsprüfung konnte nicht geladen werden.'))
    document.head.appendChild(script)
  })

  return scriptPromise
}

export async function requestTurnstileToken(siteKey: string) {
  if (!siteKey) throw new Error('Die Sicherheitsprüfung ist noch nicht konfiguriert.')
  await loadTurnstile()
  if (!window.turnstile) throw new Error('Die Sicherheitsprüfung konnte nicht gestartet werden.')

  return new Promise<string>((resolve, reject) => {
    const overlay = document.createElement('div')
    overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4'
    const panel = document.createElement('div')
    panel.className = 'w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl'
    const title = document.createElement('p')
    title.className = 'text-base font-semibold text-slate-900'
    title.textContent = 'Sicherheitsprüfung'
    const hint = document.createElement('p')
    hint.className = 'mb-4 mt-1 text-sm text-slate-600'
    hint.textContent = 'Bitte bestätigen Sie kurz, dass Sie kein Bot sind.'
    const container = document.createElement('div')
    container.className = 'flex min-h-[65px] justify-center'
    panel.append(title, hint, container)
    overlay.appendChild(panel)
    document.body.appendChild(overlay)

    let widgetId = ''
    const cleanup = () => {
      if (widgetId) window.turnstile?.remove(widgetId)
      overlay.remove()
    }
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Die Sicherheitsprüfung hat zu lange gedauert. Bitte versuchen Sie es erneut.'))
    }, 30_000)

    widgetId = window.turnstile!.render(container, {
      sitekey: siteKey,
      execution: 'execute',
      appearance: 'always',
      callback: (token: string) => {
        window.clearTimeout(timeout)
        cleanup()
        resolve(token)
      },
      'error-callback': () => {
        window.clearTimeout(timeout)
        cleanup()
        reject(new Error('Die Sicherheitsprüfung ist fehlgeschlagen.'))
      },
      'expired-callback': () => {
        window.clearTimeout(timeout)
        cleanup()
        reject(new Error('Die Sicherheitsprüfung ist abgelaufen.'))
      },
    })
    window.turnstile!.execute(widgetId)
  })
}
