import { useMemo } from 'react'
import { t } from '../i18n'
import { ARRIVAL_AIRPORTS, airportByIcao, etaMinutes, formatEta, landingClock } from '../lib/inbound'
import { typeLabel } from '../lib/typeNames'
import { IconLanding, IconBell } from './UiIcons'
import { ON_COLOR, OFF_COLOR } from './Toggle'

// Panel „Przyloty": jumbo jety i An-124 lecące do Rzeszowa i Krakowa, osobno
// dla każdego lotniska, od najwcześniej lądującego. Wcześniej te maszyny były
// tylko znacznikami na mapie — trzeba było ich szukać, często nad Atlantykiem.
// Kliknięcie wiersza zaznacza maszynę i przesuwa do niej mapę. Dzwonek przy
// nazwie lotniska włącza powiadomienia i znaczniki na mapie dla tego lotniska
// (wcześniej osobna sekcja na dole Powiadomień — decyzja użytkownika
// 07.11.2026: ustawienie stoi tam, gdzie widać przyloty).

function Bell({ airport, on, onToggle }) {
  return (
    <button type="button" className="arr-bell" aria-pressed={on} onClick={onToggle}
      style={{ color: on ? ON_COLOR : OFF_COLOR }}
      aria-label={`${t('ARR_BELL_A11Y')} ${airport.name}`} title={t('ARR_BELL_HINT')}>
      <IconBell on={on} size={15} />
      <span>{on ? t('ARR_BELL_ON') : t('ARR_BELL_OFF')}</span>
    </button>
  )
}

// Skąd wiemy, że leci właśnie tutaj — ta sama gradacja co na karcie maszyny.
function sourceNote(route) {
  if (route?.guess) return t('ARR_SOURCE_GUESS')
  // Pamięć (ten rejs albo przewoźnik) — krótko, jak na karcie maszyny.
  if (route?.learned) return t('ARR_SOURCE_LEARNED')
  const from = route?.fromCity || route?.from
  return from ? `${t('INFO_ARRIVAL_FROM')} ${from}` : null
}

// Pusty stan mówi, kiedy ostatnio coś tu siadało — „brak przylotów" sam
// w sobie nie odróżnia spokojnego dnia od niedziałającej aplikacji.
function lastAt(landed, icao) {
  const last = landed.find(x => x.to === icao)
  return last ? `${t('ARR_LAST_LANDED')} ${last.flight}, ${landedWhen(last.at)}` : ''
}

function Row({ x, airport, onOpen }) {
  // Czas liczony tu, z bieżącej pozycji — wartość z serwera bywa sprzed
  // kilku minut (tak samo jak na karcie maszyny).
  const min = etaMinutes(x, airport)
  // Krąży nad lotniskiem (mgła, kolejka do pasa) — czas lądowania nieznany.
  const note = x.holding ? t('ARR_HOLDING_NOTE') : sourceNote(x.route)
  return (
    <li>
      <button type="button" className="arr-row" onClick={() => onOpen(x.hex)}>
        <span className="arr-row__ico"><IconLanding /></span>
        <span className="arr-row__main">
          <span className="arr-row__head">
            <span className="arr-row__flight">{x.flight || x.hex}</span>
            <span className="arr-row__type">{typeLabel(x.t) || x.t}</span>
          </span>
          {note && <span className="arr-row__note">{note}</span>}
        </span>
        <span className="arr-row__eta">
          {x.holding
            ? <><span className="arr-row__clock arr-row__clock--hold">{t('ARR_HOLDING')}</span><span className="arr-row__in">{t('ARR_HOLDING_WAIT')}</span></>
            : min != null
            // Na wierzchu „za ile", godzina mniejsza pod spodem — tak samo
            // jak na karcie maszyny.
            ? <><span className="arr-row__clock">{t('INFO_ARRIVAL_IN')} {formatEta(min)}</span><span className="arr-row__in">{t('INFO_ARRIVAL_ABOUT')} {landingClock(min)}</span></>
            : <span className="arr-row__in">{t('ARR_NO_ETA')}</span>}
        </span>
      </button>
    </li>
  )
}

// „Ostatnio lądowały": dzień i godzina po polsku, typ jak na liście przylotów.
const whenFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' })
const timeFmt = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })
function landedWhen(at) {
  if (dayFmt.format(at) === dayFmt.format(Date.now())) return `${t('USAGE_TODAY').toLowerCase()} ${timeFmt.format(at)}`
  return whenFmt.format(at).replace(',', '')
}

function Landed({ landed }) {
  if (!landed.length) return null
  return (
    <section className="cp-section">
      <div className="cp-label">{t('ARR_LANDED_LABEL')}</div>
      <ul className="arr-landed">
        {landed.map(x => (
          <li key={`${x.flight}-${x.at}`} className="arr-landed__row">
            <span className="arr-landed__ico"><IconLanding size={14} /></span>
            <span className="arr-landed__flight">{x.flight}</span>
            <span className="arr-landed__type">{typeLabel(x.t) || x.t || ''}</span>
            <span className="arr-landed__when">{airportByIcao(x.to)?.name || x.to} · {landedWhen(x.at)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function ArrivalsPanel({ inbound, landed = [], arrivals, setArrivals, isSubscribed, onOpenAlerts, onOpen }) {
  const anyBell = ARRIVAL_AIRPORTS.some(a => arrivals[a.icao] !== false)
  const byAirport = useMemo(() => ARRIVAL_AIRPORTS.map(airport => ({
    airport,
    list: inbound
      .filter(x => x.route?.to === airport.icao)
      .sort((a, b) => (etaMinutes(a, airport) ?? 1e9) - (etaMinutes(b, airport) ?? 1e9)),
  })), [inbound])

  return (
    <div className="panel-body">
      {/* Dzwonek bez włączonych powiadomień steruje tylko znacznikiem na
          mapie — mówimy to wprost, zamiast obiecywać push, który nie przyjdzie. */}
      {!isSubscribed && anyBell && (
        <div className="arr-nopush">
          <span className="arr-nopush__ico"><IconBell on={false} /></span>
          <span className="arr-nopush__text">{t('ARR_NO_PUSH')}</span>
          <button type="button" className="btn btn--sm" onClick={onOpenAlerts}>{t('ARR_NO_PUSH_LINK')}</button>
        </div>
      )}
      {byAirport.map(({ airport, list }) => (
        <section key={airport.icao} className="cp-section">
          <div className="arr-head">
            <span className="arr-head__name">{airport.name} <span className="arr-head__icao">{airport.icao}</span></span>
            <Bell airport={airport} on={arrivals[airport.icao] !== false}
              onToggle={() => setArrivals(prev => ({ ...prev, [airport.icao]: prev[airport.icao] === false }))} />
          </div>
          {arrivals[airport.icao] === false && <p className="arr-off">{t('ARR_AIRPORT_OFF')}</p>}
          {list.length
            ? <ul className="arr-list">{list.map(x => <Row key={x.hex} x={x} airport={airport} onOpen={onOpen} />)}</ul>
            : <p className="arr-empty">{t('ARR_EMPTY')}{lastAt(landed, airport.icao) && <span className="arr-empty__last">{lastAt(landed, airport.icao)}</span>}</p>}
        </section>
      ))}
      <Landed landed={landed} />
      <p className="arr-foot">{t('ARR_FOOT')}</p>
    </div>
  )
}
