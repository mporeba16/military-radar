import { useMemo } from 'react'
import { t } from '../i18n'
import { ARRIVAL_AIRPORTS, etaMinutes, formatEta, landingClock } from '../lib/inbound'
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
      <IconBell on={on} />
      <span>{on ? t('SOUND_ON') : t('SOUND_OFF')}</span>
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

function Row({ x, airport, onOpen }) {
  // Czas liczony tu, z bieżącej pozycji — wartość z serwera bywa sprzed
  // kilku minut (tak samo jak na karcie maszyny).
  const min = etaMinutes(x, airport)
  const note = sourceNote(x.route)
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
          {min != null
            // Na wierzchu „za ile", godzina mniejsza pod spodem — tak samo
            // jak na karcie maszyny.
            ? <><span className="arr-row__clock">{t('INFO_ARRIVAL_IN')} {formatEta(min)}</span><span className="arr-row__in">{t('INFO_ARRIVAL_ABOUT')} {landingClock(min)}</span></>
            : <span className="arr-row__in">{t('ARR_NO_ETA')}</span>}
        </span>
      </button>
    </li>
  )
}

export default function ArrivalsPanel({ inbound, arrivals, setArrivals, onOpen }) {
  const byAirport = useMemo(() => ARRIVAL_AIRPORTS.map(airport => ({
    airport,
    list: inbound
      .filter(x => x.route?.to === airport.icao)
      .sort((a, b) => (etaMinutes(a, airport) ?? 1e9) - (etaMinutes(b, airport) ?? 1e9)),
  })), [inbound])

  return (
    <div className="panel-body">
      {byAirport.map(({ airport, list }) => (
        <section key={airport.icao} className="cp-section">
          <div className="cp-label arr-head">
            <span>{airport.name} ({airport.icao})</span>
            <Bell airport={airport} on={arrivals[airport.icao] !== false}
              onToggle={() => setArrivals(prev => ({ ...prev, [airport.icao]: prev[airport.icao] === false }))} />
          </div>
          {arrivals[airport.icao] === false && <p className="arr-off">{t('ARR_AIRPORT_OFF')}</p>}
          {list.length
            ? <ul className="arr-list">{list.map(x => <Row key={x.hex} x={x} airport={airport} onOpen={onOpen} />)}</ul>
            : <p className="arr-empty">{t('ARR_EMPTY')}</p>}
        </section>
      ))}
      <p className="arr-foot">{t('ARR_FOOT')}</p>
    </div>
  )
}
