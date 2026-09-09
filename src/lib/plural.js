// Polska odmiana liczebnika. Serwer miał już tę logikę w notify.js dla treści
// powiadomień, ale klient wstawiał stałe „samolotów", więc licznik w panelu
// pokazywał „2 samolotów". Trzymamy to osobno, żeby dało się testować bez
// renderu Reacta i żeby obie strony mówiły tak samo.
//
// Reguła: 1 → mianownik, 2–4 → mianownik liczby mnogiej (ale nie 12–14),
// reszta → dopełniacz liczby mnogiej.
export function plForm(n, one, few, many) {
  const abs = Math.abs(n)
  if (abs === 1) return one
  const t = abs % 10
  const h = abs % 100
  if (t >= 2 && t <= 4 && !(h >= 12 && h <= 14)) return few
  return many
}

export function planeWord(n) {
  return plForm(n, 'samolot', 'samoloty', 'samolotów')
}

export function machineWord(n) {
  return plForm(n, 'maszyna', 'maszyny', 'maszyn')
}
