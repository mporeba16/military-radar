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
