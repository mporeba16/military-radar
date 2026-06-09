import { useState, useEffect } from 'react'
import { altToColor, ftToM, knToKmh, getCommonName, countryFromHex, countryFlag } from './aircraftShapes'
import { findLikelyLanding } from '../airfields'
import { t, useLang, getLang } from '../i18n'
import './AircraftInfoPanel.css'

// V4: ICAO special transponder codes that mean something serious
const SPECIAL_SQUAWKS = {
  '7500': { label: '🚨 7500 PORWANIE', kind: 'critical' },
  '7600': { label: '⚠ 7600 BRAK ŁĄCZNOŚCI', kind: 'warn' },
  '7700': { label: '🚨 7700 EMERGENCY', kind: 'critical' },
  '7400': { label: '⚠ 7400 UTRATA UAV', kind: 'warn' },
}

// V5: operator inferred from callsign prefix
const OPERATOR_PATTERNS = [
  [/^GAF\d/, 'Luftwaffe (Niemcy)'],
  [/^LIFT/, 'Luftwaffe (Niemcy)'],
  [/^RCF/, 'Siły Powietrzne RP'],
  [/^PLF/, 'Siły Powietrzne RP'],
  [/^RCH|^REACH/, 'USAF Air Mobility Command'],
  [/^DUKE|^JAKE|^POLO|^GORDO|^PEARL|^FORTE|^RAZER|^KNIFE|^IRON|^SWORD|^VALOR|^HEAVY|^EAGLE\d|^VIPER|^DEMON|^KNIGHT|^SHADOW|^GHOST|^RAVEN|^STALLION|^RANGER\d|^TIGER\d|^VENOM|^SPECTRE|^SPOOKY|^JOLLY|^PEDRO|^KING\d|^PAVE|^COMBAT/, 'USAF / US Air Force'],
  [/^MAGMA|^ASCOT|^COMET/, 'RAF (Wlk. Brytania)'],
  [/^NATO|^NAOC|^NATOQ/, 'NATO'],
  [/^FRAF/, 'Armée de l\'Air (Francja)'],
  [/^BAF\d/, 'Belgian Air Force'],
  [/^DAMP/, 'Danish Air Force'],
  [/^CZAF/, 'Czech Air Force'],
  [/^SLAF/, 'Slovak Air Force'],
  [/^HUNAF/, 'Hungarian Air Force'],
  [/^BUAF/, 'Bulgarian Air Force'],
  [/^ROTAF/, 'Romanian Air Force'],
  [/^FNY|^FINAF/, 'Finnish Air Force'],
  [/^NRAF|^SAVER/, 'Norwegian Air Force'],
  [/^SWAF/, 'Swedish Air Force'],
  [/^LTAF/, 'Lithuanian Air Force'],
  [/^LVAF/, 'Latvian Air Force'],
  [/^EEAF/, 'Estonian Air Force'],
  [/^RIMC/, 'Aeronautica Militare (Włochy)'],
  [/^BAH/, 'Bahrain Royal Air Force'],
  [/^KAF/, 'Kuwait Air Force'],
  [/^QAF/, 'Qatar Emiri Air Force'],
  [/^OAF/, 'Oman Royal Air Force'],
  [/^SRA/, 'Saudi Royal Air Force'],
  [/^SHAHD/, 'Jordan Royal Air Force'],
]

function operatorFrom(callsign) {
  const cs = (callsign || '').toUpperCase()
  for (const [re, op] of OPERATOR_PATTERNS) {
    if (re.test(cs)) return op
  }
  return null
}

// M2: bearing in degrees → compass direction
function bearingLabel(deg) {
  if (deg == null) return null
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const idx = Math.round(((deg % 360) / 45)) % 8
  return `${dirs[idx]} · ${Math.round(deg)}°`
}

function formatDuration(ms) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem} min` : `${h}h`
}

function formatHhmm(ts) {
  return new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

// planespotters.net lookup is tricky for military:
//   - hex→photo: incomplete (Mi-17 hex 48DA46 returns nothing or stale link)
//   - reg→photo: registrations like "018" or "605" are NOT unique globally
//     (PLF038 / Polish C-295 reg 018 collides with Hellenic AF F-16 reg 018)
//
// Strategy: fetch BOTH endpoints in parallel, dedup by photo id, then pick
// the candidate whose slug URL best matches the aircraft type and operator
// inferred from the callsign. Planespotters URLs have the form
//   https://www.planespotters.net/photo/{id}/{reg}-{operator}-{model}
// so we can score reliably without an extra metadata fetch.

const OPERATOR_HINT_BY_CALLSIGN = [
  [/^(PLF|RCF)/, 'polish'],
  [/^(GAF|LIFT)/, 'luftwaffe'],
  [/^(RCH|REACH|DUKE|JAKE|POLO|GORDO|PEARL|FORTE|RAZER|KNIFE|IRON|SWORD|VALOR|HEAVY|EAGLE\d|VIPER|KING\d)/, 'air-force'],  // USAF — slug usually has "united-states-air-force"
  [/^(MAGMA|ASCOT|COMET)/, 'royal-air-force'],
  [/^(NATO|NAOC|NATOQ)/, 'nato'],
  [/^(FRAF|CTM|COTAM|FNAV|FMRN)/, 'french'],  // CTM/COTAM = francuski transport wojskowy, FNAV/FMRN = lotnictwo MW
  [/^BAF\d/, 'belgian'],
  [/^DAMP/, 'danish'],
  [/^CZAF/, 'czech'],
  [/^SLAF/, 'slovak'],
  [/^HUNAF/, 'hungarian'],
  [/^(BUAF|BAH)/, 'bulgarian'],
  [/^ROTAF/, 'romanian'],
  [/^(FNY|FINAF)/, 'finnish'],
  [/^(NRAF|SAVER)/, 'norwegian'],
  [/^SWAF/, 'swedish'],
  [/^LTAF/, 'lithuanian'],
  [/^LVAF/, 'latvian'],
  [/^EEAF/, 'estonian'],
  [/^RIMC/, 'italian'],
  [/^SRA/, 'saudi'],
  [/^HAF/, 'hellenic'],
]

// ICAO type code → list of slug substrings planespotters uses in URLs.
// Mostly needed for airliners where the ICAO code (e.g. B738) doesn't
// appear in URLs (those use "boeing-737-800" / "737-800").
const TYPE_SLUG_ALIASES = {
  // Boeing
  B737: ['737'], B738: ['737', '738', '737-800'], B739: ['737', '737-900'],
  B38M: ['737-max-8', '737-8'], B39M: ['737-max-9', '737-9'],
  B744: ['747', '747-400'], B748: ['747-8'], B752: ['757'], B753: ['757-300'],
  B762: ['767'], B763: ['767-300'], B764: ['767-400'],
  B772: ['777-200'], B773: ['777-300'], B77L: ['777-200lr'], B77W: ['777-300er'],
  B788: ['787', '787-8'], B789: ['787-9'], B78X: ['787-10'],
  B703: ['707'], B707: ['707'],
  // Airbus
  A318: ['a318'], A319: ['a319'], A320: ['a320'], A321: ['a321'],
  A20N: ['a320neo', 'a320'], A21N: ['a321neo', 'a321'],
  A332: ['a330-200', 'a330'], A333: ['a330-300', 'a330'],
  A338: ['a330-800neo', 'a330'], A339: ['a330-900neo', 'a330'],
  A342: ['a340-200'], A343: ['a340-300'], A345: ['a340-500'], A346: ['a340-600'],
  A359: ['a350-900', 'a350'], A35K: ['a350-1000', 'a350'],
  A380: ['a380'], A388: ['a380-800', 'a380'],
  A310: ['a310'], A30B: ['a300'],
  // McDonnell Douglas / DC
  MD11: ['md-11', 'md11'], DC10: ['dc-10'], DC9: ['dc-9'],
  MD80: ['md-80'], MD82: ['md-82'], MD83: ['md-83'], MD88: ['md-88'], MD90: ['md-90'],
  // Embraer regional
  E170: ['e-170', 'erj-170'], E175: ['e-175', 'erj-175'],
  E190: ['e-190', 'erj-190'], E195: ['e-195', 'erj-195'],
  E290: ['e190-e2'], E295: ['e195-e2'],
  // Tupolev / Antonov / Ilyushin
  IL62: ['il-62'], IL76: ['il-76'], IL78: ['il-78'], IL96: ['il-96'],
  AN12: ['an-12'], AN22: ['an-22'], AN26: ['an-26'], AN30: ['an-30'],
  AN32: ['an-32'], AN72: ['an-72'], AN74: ['an-74'], AN124: ['an-124'], AN225: ['an-225'],
  TU95: ['tu-95'], TU142: ['tu-142'], TU160: ['tu-160'], TU22: ['tu-22'],
  // Military transports (where ICAO != slug)
  C30J: ['c-130j', 'c-130'], C13J: ['c-130j', 'c-130'],
  C160: ['c-160', 'transall'],
  A400: ['a400m', 'a-400'], A400M: ['a400m'],
  // Fighters where dashes / numbers vary
  C295: ['c-295', 'cn-295'], C235: ['cn-235'], C212: ['c-212'],
  F35: ['f-35'], F16: ['f-16'], F15: ['f-15'], F18: ['f-18', 'fa-18'],
  F22: ['f-22'], F4: ['f-4'], F14: ['f-14'], F2: ['f-2'], F5: ['f-5'],
  F104: ['f-104'], F111: ['f-111'],
  MIR2: ['mirage-2000'], MIRF: ['mirage-f1'], MIRA: ['mirage'],
  M2KA: ['mirage-2000'], M2KC: ['mirage-2000'], M2KD: ['mirage-2000'], M2KN: ['mirage-2000'],
  EUFI: ['eurofighter', 'typhoon'], EF2000: ['typhoon', 'eurofighter'],
  RFAL: ['rafale'], JS39: ['gripen', 'jas-39'], JAS39: ['gripen', 'jas-39'],
  TORN: ['tornado'], B1: ['b-1'], B2: ['b-2', 'spirit'], B52: ['b-52'],
  A10: ['a-10'], U2: ['u-2'],
  T6: ['t-6', 'texan'], T7: ['t-7'], T45: ['t-45'], T38: ['t-38'],
  L39: ['l-39'], YK130: ['yak-130'], YAK130: ['yak-130'],
  AV8: ['av-8', 'harrier'], AV8B: ['av-8b'],
  // Helicopters
  AH64: ['ah-64', 'apache'], CH47: ['ch-47', 'chinook'], CH53: ['ch-53'],
  UH60: ['uh-60', 'black-hawk', 'blackhawk'],
  S70: ['s-70', 'black-hawk', 'blackhawk'], V22: ['v-22', 'osprey'],
  MV22: ['mv-22'], CV22: ['cv-22'],
  MI2: ['mi-2'], MI8: ['mi-8'], MI17: ['mi-17'], MI24: ['mi-24'], MI28: ['mi-28'],
  W3: ['w-3', 'sokol'], W3A: ['w-3', 'sokol'],
  EC135: ['ec135', 'ec-135'], EC145: ['ec145', 'ec-145'], EC725: ['ec725', 'caracal'],
  AS332: ['as332', 'super-puma'], AS532: ['as532', 'cougar'],
  // UAVs
  MQ9: ['mq-9', 'reaper'], MQ1: ['mq-1'], RQ4: ['rq-4'],
  // Dassault Falcon / business jets (ICAO code != planespotters slug)
  F900: ['falcon-900', 'falcon'], F2TH: ['falcon-2000', 'falcon'],
  FA7X: ['falcon-7x', 'falcon'], FA8X: ['falcon-8x', 'falcon'], F50: ['falcon-50', 'falcon'],
  F406: ['f406', 'caravan-ii'], E55P: ['phenom-300'], E50P: ['phenom-100'],
  GLF5: ['gulfstream-v'], GLF6: ['gulfstream'], C56X: ['citation'], C68A: ['citation'],
}

function typeSlugCandidates(t) {
  const acType = (t || '').toUpperCase().replace(/[-\s]/g, '')
  if (!acType) return []
  const aliases = TYPE_SLUG_ALIASES[acType] || []
  const lower = acType.toLowerCase()
  // Always also try the raw forms — works for unique ICAO codes (Mi-17, F-16…)
  const dashed = lower.replace(/^([a-z]+)(\d.*)$/, '$1-$2')
  return [...new Set([...aliases, lower, dashed])]
}

function scorePhotoMatch(photo, ac) {
  const link = (photo.link || '').toLowerCase()
  if (!link) return 0
  let score = 0

  // Type match — try multiple slug forms because planespotters uses the
  // marketing name ("boeing-737-800") not the ICAO code ("B738").
  const candidates = typeSlugCandidates(ac.t)
  if (candidates.length) {
    if (candidates.some(c => link.includes(c))) score += 100
    else score -= 30  // type known but slug doesn't mention any alias — wrong photo
  }

  // Operator hint from callsign prefix
  const callsign = (ac.flight || '').toUpperCase()
  for (const [re, hint] of OPERATOR_HINT_BY_CALLSIGN) {
    if (re.test(callsign)) {
      if (link.includes(hint)) score += 50
      break
    }
  }

  // Registration-sourced photo wins ties over a hex-sourced one — the reg is
  // the current airframe's identity, while a hex can be stale/reassigned in
  // planespotters (e.g. a French mil hex resolving to a retired Fouga). Bonus
  // is below the type-match weight (100), so a hex photo that truly matches the
  // type still wins over a reg photo that doesn't.
  if (photo._src === 'reg') score += 60

  return score
}

function useAircraftPhoto(hex, reg, ac) {
  const [photo, setPhoto] = useState(null)
  // 'idle' | 'loading' | 'ok' | 'not-found' | 'error'
  // 'not-found' = planespotters returned 0 photos (image genuinely missing)
  // 'error'     = network / timeout / bad response (try again later)
  const [state, setState] = useState('idle')
  useEffect(() => {
    if (!hex && !reg) return
    setPhoto(null)
    setState('loading')
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 6000)

    // Returns { ok, photos } so we can distinguish "no photos" (ok=true,
    // empty list) from "fetch broke" (ok=false).
    const fetchList = async (url) => {
      try {
        const r = await fetch(url, { signal: ctrl.signal })
        if (!r.ok) return { ok: false, photos: [] }
        const data = await r.json()
        return { ok: true, photos: data?.photos || [] }
      } catch (err) {
        if (err.name === 'AbortError') throw err
        return { ok: false, photos: [] }
      }
    }

    ;(async () => {
      try {
        // Fetch hex + reg in parallel. The REGISTRATION is the authoritative
        // identity of the current airframe; a hex can be stale in planespotters
        // (military hexes get reassigned), so we tag the source and put reg
        // photos first — scorePhotoMatch then gives them a tie-breaking bonus.
        const [hexRes, regRes] = await Promise.all([
          hex ? fetchList(`https://api.planespotters.net/pub/photos/hex/${hex}`) : Promise.resolve({ ok: true, photos: [] }),
          reg ? fetchList(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg)}`) : Promise.resolve({ ok: true, photos: [] }),
        ])
        const anyOk = hexRes.ok || regRes.ok
        const results = [
          ...regRes.photos.map(p => ({ ...p, _src: 'reg' })),
          ...hexRes.photos.map(p => ({ ...p, _src: 'hex' })),
        ]

        const seen = new Set()
        const unique = results.filter(p => {
          if (!p?.id || seen.has(p.id)) return false
          seen.add(p.id)
          return true
        })
        if (!unique.length) {
          // Distinguish: at least one endpoint returned cleanly → genuinely
          // no photo. All requests broke → network/server error.
          setPhoto(null); setState(anyOk ? 'not-found' : 'error')
          return
        }

        unique.sort((a, b) => scorePhotoMatch(b, ac) - scorePhotoMatch(a, ac))
        setPhoto(unique[0])
        setState('ok')
      } catch (err) {
        if (err.name === 'AbortError') return
        setPhoto(null); setState('error')
      } finally {
        clearTimeout(timeout)
      }
    })()
    return () => { clearTimeout(timeout); ctrl.abort() }
  }, [hex, reg, ac.t, ac.flight])
  return { photo, state }
}

export default function AircraftInfoPanel({ ac, trailSources, firstSeen, onClose }) {
  useLang()  // re-render on language switch
  const { photo, state: photoState } = useAircraftPhoto(ac.hex, ac.reg, ac)
  const [imgError, setImgError] = useState(false)
  const altM = ftToM(ac.alt_baro)
  const kmh = knToKmh(ac.gs)
  const color = altToColor(altM)
  const commonName = getCommonName(ac.t)
  const country = ac.country || countryFromHex(ac.hex)
  const flag = country ? countryFlag(country) : ''
  const operator = operatorFrom(ac.flight)
  const landing = findLikelyLanding(ac)

  useEffect(() => { setImgError(false) }, [photo])

  const vsLabel = ac.baro_rate != null
    ? (ac.baro_rate > 64 ? `▲ +${ac.baro_rate}` : ac.baro_rate < -64 ? `▼ ${ac.baro_rate}` : '→ 0')
    : null

  // M2: distance + bearing combined
  const distRow = ac._dist != null
    ? `${Math.round(ac._dist)} km${ac._bearing != null ? ` · ${bearingLabel(ac._bearing)}` : ''}`
    : null

  const rows = [
    [t('INFO_TYPE'),       ac.t ? (commonName ? `${ac.t} · ${commonName}` : ac.t) : '—'],
    operator ? [t('INFO_OPERATOR'),  operator] : null,
    distRow ? [t('INFO_DISTANCE'), distRow] : null,
    [t('INFO_ALTITUDE'), altM != null ? `${altM.toLocaleString()} m` : '—'],
    vsLabel ? [t('INFO_VS'), `${vsLabel} ft/min`] : null,
    [t('INFO_SPEED'), kmh != null ? `${kmh} km/h` : '—'],
    country ? [t('INFO_COUNTRY'),  country] : null,
    firstSeen ? [t('INFO_ON_RADAR'), `${formatDuration(Date.now() - firstSeen)} · od ${formatHhmm(firstSeen)}`] : null,
  ].filter(Boolean)

  const photoSrc = photo?.thumbnail_large?.src || photo?.thumbnail?.src
  const showPhoto = !!(photo && photoSrc && !imgError)

  // V4: special squawk badge
  const specialSquawk = ac.squawk ? SPECIAL_SQUAWKS[String(ac.squawk).padStart(4, '0')] : null

  // M1: trail summary with duration + start time
  let trailLine = null
  if (trailSources) {
    const count = trailSources.blob || 0
    const parts = [`${count} ${t('INFO_TRAIL_PTS')}`]
    if (trailSources.blobFirstTs && trailSources.blobLastTs) {
      const spanMs = trailSources.blobLastTs - trailSources.blobFirstTs
      parts.push(formatDuration(spanMs))
      parts.push(`${getLang() === 'en' ? 'from' : 'od'} ${formatHhmm(trailSources.blobFirstTs)}`)
    }
    trailLine = parts.join(' · ')
  }

  return (
    <div className="ac-info-panel">
      <div className="ac-info-header">
        <span className="ac-info-title">
          {flag && <span className="ac-info-flag">{flag}</span>}
          <span className="ac-info-callsign" style={{ color }}>
            {ac.flight?.trim() || ac.hex}
          </span>
        </span>
        <button className="ac-info-close" onClick={onClose} aria-label={t('CLOSE_AIRCRAFT_PANEL')}>✕</button>
      </div>

      {specialSquawk && (
        <div className={`ac-info-squawk-badge ac-info-squawk-${specialSquawk.kind}`}>
          {specialSquawk.label}
        </div>
      )}

      {photoState === 'loading' && <div className="ac-info-photo-skeleton" />}

      {showPhoto && (
        <a className="ac-info-photo-wrap" href={photo.link} target="_blank" rel="noopener noreferrer">
          <img
            src={photoSrc}
            alt={ac.flight || ac.hex}
            className="ac-info-photo"
            onError={() => setImgError(true)}
          />
          <span className="ac-info-photo-credit">© {photo.photographer}</span>
        </a>
      )}

      {photoState === 'not-found' && (
        <div className="ac-info-photo-empty">{t('PHOTO_NOT_FOUND')}</div>
      )}

      {photoState === 'error' && (
        <div className="ac-info-photo-empty" style={{ color: '#ffb74d', borderColor: 'rgba(255,183,77,0.3)' }}>
          {t('PHOTO_ERROR')}
        </div>
      )}

      {landing && (
        <div className={`ac-info-landing${landing.onApproach ? ' approach' : ''}`}>
          <span className="ac-info-landing-ico">🛬</span>
          <span>
            {landing.onApproach ? t('INFO_LANDING_APPROACH') : t('INFO_LANDING')}:{' '}
            <strong>{landing.icao} {landing.name}</strong>
            <span className="ac-info-landing-dist"> · {landing.distKm} km</span>
          </span>
        </div>
      )}

      <table className="ac-info-table">
        <tbody>
          {rows.map(([label, val]) => (
            <tr key={label}>
              <td className="ac-info-label">{label}</td>
              <td className="ac-info-val">{val}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {trailLine && (
        <div className="ac-info-trail-info">
          {t('INFO_TRAIL')} <span style={{ color: '#fff' }}>{trailLine}</span>
          {trailSources?.blobError && (
            <div className="ac-info-trail-warn">{trailSources.blobError}</div>
          )}
        </div>
      )}

      <a
        className="ac-info-ext-link"
        href={`https://globe.adsbexchange.com/?icao=${ac.hex}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('EXT_LINK')}
      </a>
    </div>
  )
}
