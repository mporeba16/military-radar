import { useMemo } from 'react'
import { t } from '../i18n'
import { ARRIVAL_AIRPORTS, etaMinutes, formatEta, landingClock } from '../lib/inbound'
import { typeLabel } from '../lib/typeNames'
import { IconLanding } from './UiIcons'

// Panel „Przyloty": jumbo jety i An-124 lecące do Rzeszowa i Krakowa, osobno
// dla każdego lotniska, od najwcześniej lądującego. Wcześniej te maszyny były
// tylko znacznikami na mapie — trzeba było ich szukać, często nad Atlantykiem.
// Kliknięcie wiersza zaznacza maszynę i przesuwa do niej mapę.

// Skąd wiemy, że leci właśnie tutaj — ta sama gradacja co na karcie maszyny.
function sourceNote(route) {
  if (route?.guess) return t('ARR_SOURCE_GUESS')
  // Pamięć przewoźnika: inne rejsy tego przewoźnika tam siadały.
  if (route?.fleet) return `${route.fleet} ${t('ARR_SOURCE_FLEET')}`
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
            ? <><span className="arr-row__clock">{landingClock(min)}</span><span className="arr-row__in">{t('INFO_ARRIVAL_IN')} {formatEta(min)}</span></>
            : <span className="arr-row__in">{t('ARR_NO_ETA')}</span>}
        </span>
      </button>
    </li>
  )
}

export default function ArrivalsPanel({ inbound, arrivals, onOpen }) {
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
          <div className="cp-label">{airport.name} ({airport.icao})</div>
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
