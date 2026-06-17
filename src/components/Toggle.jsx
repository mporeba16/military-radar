// Wspólny przełącznik (button.toggle-row): jeden spójny wygląd + a11y dla
// wszystkich toggle'i w panelach — filtry kategorii, dźwięk/wibracja, nakładki
// mapy. Wcześniej każdy był osobnym kawałkiem JSX (a nakładka baz miała własne
// style inline), co rozjeżdżało wygląd i dublowało kod.
//
// `marker` (kropka / ikona / kwadrat) i `state` (wskaźnik ◉/○ lub WŁ/WYŁ)
// różnią się per użycie, więc przychodzą jako węzły/teksty; reszta (shell,
// aria-pressed, klawiatura, focus) jest wspólna.
export default function Toggle({ on, onToggle, label, marker, state, stateColor, style }) {
  return (
    <button
      type="button"
      className="toggle-row"
      aria-pressed={on}
      onClick={onToggle}
      style={style}
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
