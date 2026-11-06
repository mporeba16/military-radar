// Ikony interfejsu — liniowe, w tym samym stylu co przyciski na mapie
// (MapChrome). Zastąpiły emoji (🔔 📳 🛬 🛰 🩺): te wyglądały inaczej na
// iPhonie, Androidzie i Windowsie, miały własne kolory i nie pasowały do
// reszty. Kolor z currentColor, rozmiar z `size`.

function Icon({ size = 18, children, strokeWidth = 1.6 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

// Krzyżyk zamykania. Znak ✕ z czcionki systemowej stał na każdym telefonie
// na innej wysokości i miał inną grubość niż reszta ikon.
export function IconClose({ size = 16 }) {
  return <Icon size={size} strokeWidth={1.8}><path d="M5 5l14 14M19 5 5 19" /></Icon>
}

export function IconSound({ on = true }) {
  return (
    <Icon>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {on
        ? <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
        : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
    </Icon>
  )
}

export function IconVibrate() {
  return (
    <Icon>
      <rect x="8" y="4" width="8" height="16" rx="1.6" />
      <path d="M4.5 8.5v7M19.5 8.5v7M2 10.5v3M22 10.5v3" />
    </Icon>
  )
}

// Lądowanie — samolot schodzący nad pas. Rysunek z Lucide („plane-landing",
// licencja ISC); własny wychodził jak but narciarski.
export function IconLanding({ size }) {
  return (
    <Icon size={size}>
      <path d="M2 22h20" />
      <path d="M3.77 10.77 2 9l2-4.5 1.1.55c.55.28.9.84.9 1.45s.35 1.17.9 1.45L8 8.5l3-6 1.05.53a2 2 0 0 1 1.09 1.52l.72 5.4a2 2 0 0 0 1.09 1.52l4.4 2.2c.42.22.78.55 1.01.96l.6 1.03c.49.88-.06 1.98-1.06 2.1l-1.18.15c-.47.06-.95-.02-1.37-.24L4.29 11.15a2 2 0 0 1-.52-.38Z" />
    </Icon>
  )
}

// Rzadkie maszyny (tankowce, AWACS, rozpoznanie) — antena z falami.
export function IconRadar() {
  return (
    <Icon>
      <path d="M12 13v8M8.5 21h7" />
      <circle cx="12" cy="11" r="2" />
      <path d="M8.2 7.2a5.4 5.4 0 0 0 0 7.6M15.8 7.2a5.4 5.4 0 0 1 0 7.6M5.5 4.5a9.2 9.2 0 0 0 0 13M18.5 4.5a9.2 9.2 0 0 1 0 13" />
    </Icon>
  )
}

// Alarmy o awariach — linia tętna.
export function IconPulse() {
  return (
    <Icon>
      <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
    </Icon>
  )
}

// Statystyki — słupki (przycisk w stopce panelu Alerty).
export function IconChart({ size = 14 }) {
  return (
    <Icon size={size}>
      <path d="M4 20h16" />
      <path d="M7 16v-5M12 16V6M17 16v-8" />
    </Icon>
  )
}

// ── Warstwy mapy (panel Mapy) — kolor z warstwy, przez currentColor ─────────

// Polska baza wojskowa — hangar.
export function IconHangar() {
  return (
    <Icon>
      <path d="M3 20V10.5L12 5l9 5.5V20" />
      <path d="M7 20v-6h10v6M3 20h18" />
    </Icon>
  )
}

// Baza NATO — gwiazda kompasowa z godła NATO.
export function IconNatoStar() {
  return (
    <Icon>
      <path d="M12 2.5l2 7.5 7.5 2-7.5 2-2 7.5-2-7.5-7.5-2 7.5-2z" />
    </Icon>
  )
}

// Poligon — tarcza strzelecka.
export function IconTarget() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" />
    </Icon>
  )
}

// Strefa przestrzeni powietrznej — przerywany wielokąt, jak na mapie.
export function IconZone() {
  return (
    <Icon>
      <path d="M4 7.5 10 4l9 3-1 9-7 4-7-4z" strokeDasharray="2.6 2.4" />
    </Icon>
  )
}

// ── Kategorie maszyn (panel Mapy) — sylwetki z góry, nosem do góry ──────────

// Wojskowe — myśliwiec: smukły kadłub, duże skrzydło trójkątne z tyłu
// i usterzenie — odróżnia się od jumbo jeta już na pierwszy rzut oka.
export function IconFighter() {
  return (
    <Icon>
      <path d="M12 2c.8 1.2 1.2 3 1.2 5v2.5l7.8 7.3v1.2l-7.8-1.2v1.6l2.6 2.1v1.2L12 20.9l-3.8.8v-1.2l2.6-2.1v-1.6L3 18v-1.2l7.8-7.3V7c0-2 .4-3.8 1.2-5z" />
    </Icon>
  )
}

// Śmigłowiec — kadłub, belka ogonowa, dwułopatowy wirnik.
export function IconHelicopter() {
  return (
    <Icon>
      <ellipse cx="12" cy="10" rx="3" ry="4.2" />
      <path d="M12 14.2v6.3M9.5 20.5h5" />
      <path d="M4 4.5l16 11M20 4.5l-16 11" />
    </Icon>
  )
}
// Duży samolot — szeroki kadłub, długie skrzydła odgięte do tyłu i cztery
// silniki pod nimi.
export function IconJumbo() {
  return (
    <Icon>
      <path d="M12 2c1 0 1.5 1.6 1.5 3.2v4.6l8 4.6v1.9l-8-2.5v4.4l2.6 1.9v1.4L12 20.6l-4.1.9v-1.4l2.6-1.9v-4.4l-8 2.5v-1.9l8-4.6V5.2C10.5 3.6 11 2 12 2z" />
      <path d="M7.4 12.9v2M16.6 12.9v2M4.6 14.6v1.6M19.4 14.6v1.6" />
    </Icon>
  )
}
