// Crony radaru na Cloudflare Workers zamiast Netlify Scheduled Functions
// (te, które da się tu uruchomić — patrz JOBS).
//
// Na Netlify każda minuta pracy cronów zjadała kredyty (czas funkcji liczony
// razem z czekaniem na adsb.fi/adsb.lol). Cloudflare liczy tylko czas
// procesora, a czekanie na sieć jest za darmo. Logika zostaje ta sama —
// importujemy handlery z netlify/functions — a dane dalej leżą w Netlify
// Blobs, więc funkcje strony (`aircraft`, `subscribe`, `status`) widzą
// trasy, migawki i subskrypcje bez zmian.
//
// Każdy cron to osobne wywołanie Workera z własnym limitem procesora.

// adsb.fi stoi za ochroną Cloudflare i Workerom odpowiada 403 (strona
// z wyzwaniem dla botów) — sprawdzone 2026-10-19. Dlatego tutaj chodzą tylko
// zadania, które pytają adsb.lol; wszystko, co potrzebuje adsb.fi, robi
// cron `tick` na Netlify.
const JOBS = {
  // Co 5 minut od minuty 3 — nie razem z tickiem w pełnych dziesiątkach.
  '3-59/5 * * * *': () => import('./types-collect.js'),
}

// @netlify/blobs zapamiętuje globalny fetch jako pole klienta i woła go jako
// metodę (`this.fetch(...)`). Workers rzucają wtedy „Illegal invocation", bo
// fetch musi być wywołany na obiekcie globalnym — owijka ignoruje `this`.
const nativeFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = (...args) => nativeFetch(...args)

// @netlify/blobs bierze siteID i token z globalnego kontekstu — ustawiamy
// go z sekretów Workera, ZANIM zaimportujemy którykolwiek handler.
function prepareEnv(env) {
  globalThis.netlifyBlobsContext = btoa(JSON.stringify({
    siteID: env.NETLIFY_SITE_ID,
    token: env.NETLIFY_TOKEN,
  }))
}

export async function runJob(cron, env) {
  const load = JOBS[cron]
  if (!load) throw new Error(`nieznany cron: ${cron}`)
  prepareEnv(env)
  const { handler } = await load()
  return handler({})
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runJob(event.cron, env).then(
      res => console.log(`[${event.cron}] ${String(res?.body ?? '').slice(0, 300)}`),
      err => console.error(`[${event.cron}] ${err.stack || err.message}`),
    ))
  },
}
