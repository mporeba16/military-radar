// Wspólny przełącznik (button.toggle-row): jeden spójny wygląd + a11y dla
// wszystkich toggle'i w panelach — filtry kategorii, dźwięk/wibracja, nakładki
// mapy. Wcześniej każdy był osobnym kawałkiem JSX (a nakładka baz miała własne
// style inline), co rozjeżdżało wygląd i dublowało kod.
//
// `marker` (kropka / ikona / kwadrat) i `state` (wskaźnik ◉/○ lub WŁ/WYŁ)
// różnią się per użycie, więc przychodzą jako węzły/teksty; reszta (shell,
// aria-pressed, klawiatura, focus) jest wspólna.
// `title` niesie wyjaśnienie, które wcześniej stało pod przełącznikiem jako
// akapit. Panel ma być listą przełączników, a nie instrukcją obsługi — ale
// informacja nie ginie, tylko schodzi do podpowiedzi.
import { t } from '../i18n'

// Stan przełącznika włącz/wyłącz: zawsze zielone „WŁ" i czerwone „WYŁ"
// (decyzja użytkownika 06.11.2026). Wcześniej każdy wiersz miał swój kolor
// — przyloty bursztynowy, wyłączone szare — i nie było od razu widać, co
// jest włączone.
export const ON_COLOR = '#00ff88'
export const OFF_COLOR = '#ff4757'
export function onOff(on) {
  return { state: on ? t('SOUND_ON') : t('SOUND_OFF'), stateColor: on ? ON_COLOR : OFF_COLOR }
}

export default function Toggle({ on, onToggle, label, marker, state, stateColor, style, title }) {
  return (
    <button
      type="button"
      className="toggle-row"
      aria-pressed={on}
      onClick={onToggle}
      style={style}
      title={title}
    >
      {marker}
      <span className="toggle-row__label">{label}</span>
      {state != null && (
        <span className="toggle-row__state" style={stateColor ? { color: stateColor } : undefined}>
          {state}
        </span>
      )}
    </button>
  )
}
