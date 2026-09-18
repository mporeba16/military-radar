// Pomiar okna NA URZĄDZENIU. Powstał, bo pustego pasa u dołu ekranu na iPhonie
// nie da się odtworzyć ani w Chromium, ani w żadnym emulatorze: nie mają trybu
// standalone iOS i nie zwracają wcięć bezpiecznych. Cztery kolejne poprawki
// opierały się na hipotezach, których nie było jak sprawdzić — to kończy
// zgadywanie i pokazuje liczby z telefonu.
//
// Wcięcia czytamy przez element-sondę: CSS potrafi je wstawić jako padding,
// JavaScript nie ma do nich bezpośredniego dostępu.
export function readSafeAreaInsets() {
  if (typeof document === 'undefined') return { top: null, bottom: null, left: null, right: null }
  const probe = document.createElement('div')
  probe.style.cssText = [
    'position:fixed', 'visibility:hidden', 'pointer-events:none',
    'top:0', 'left:0', 'width:0', 'height:0',
    'padding-top:env(safe-area-inset-top,0px)',
    'padding-bottom:env(safe-area-inset-bottom,0px)',
    'padding-left:env(safe-area-inset-left,0px)',
    'padding-right:env(safe-area-inset-right,0px)',
  ].join(';')
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  const px = v => Math.round(parseFloat(v) || 0)
  const out = {
    top: px(cs.paddingTop), bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft), right: px(cs.paddingRight),
  }
  probe.remove()
  return out
}

export function readViewportReport() {
  if (typeof window === 'undefined') return null
  const el = document.querySelector('.app')
  const appH = el ? Math.round(el.getBoundingClientRect().height) : null
  const mapa = document.querySelector('.leaflet-container')
  const mapH = mapa ? Math.round(mapa.getBoundingClientRect().height) : null
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  return {
    standalone,
    // Przesunięcie okna względem ekranu. To jedyna liczba, która rozstrzyga,
    // czy niewykorzystane piksele ekranu leżą NAD oknem (pasek stanu), czy POD
    // nim (pasek gestu) — z samej wysokości nie da się tego wywnioskować.
    screenY: window.screenY ?? window.screenTop ?? null,
    outerH: window.outerHeight ?? null,
    innerH: window.innerHeight,
    screenH: window.screen?.height ?? null,
    visualH: window.visualViewport ? Math.round(window.visualViewport.height) : null,
    dvh: Math.round(document.documentElement.clientHeight),
    appH,
    mapH,
    dpr: window.devicePixelRatio,
    insets: readSafeAreaInsets(),
  }
}
