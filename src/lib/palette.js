// Paleta aplikacji. Kolor koduje JEDNĄ oś naraz, a osie nie dzielą się barwą —
// przed uporządkowaniem `#ffb300` znaczyło jednocześnie „duży samolot”,
// „polska baza” i „poziom obserwacji”, a dwie nierozróżnialne czerwienie
// (`#ff2d55` i `#ff3b30`) oznaczały najwyższe zagrożenie i stały poligon.
//
// Trzy osie:
//   1. RUCH        — żywe maszyny na mapie. Nasycone, bo to treść aplikacji.
//   2. INFRASTRUKTURA — bazy i poligony. Przygaszone: to tło odniesienia,
//                    stoi tam od lat i nie ma prawa krzyczeć głośniej niż alert.
//   3. ZAGROŻENIE  — jedyna oś, która używa rampy alarmowej.
//
// Wartości duplikują się w :root (index.css) dla warstwy CSS. Zmiana tutaj
// wymaga zmiany tam — nie ma wspólnego źródła między JS a arkuszem, więc
// pilnuje tego test.

// ── 1. Ruch ───────────────────────────────────────────────────────────────
export const KIND_COLORS = {
  mil: '#00ff88',
  heli: '#00d9ff',
  heavy: '#ffb300',
}

// ── 2. Infrastruktura ─────────────────────────────────────────────────────
// Polskie lotniska wojskowe: ciemny niebieski (decyzja użytkownika). Kwadrat
// i obrys terenu lotniska mają ten sam kolor.
export const BASE_PL = '#2f5fd0'
export const BASE_NATO = '#6d95b8'

// Poligony: pomarańcz (decyzja użytkownika). Wyraźnie czerwieńszy od bursztynu
// dużych samolotów (#ffb300), a czerwień alarmu zostaje dla zdarzeń.
export const RANGE = '#e8741c'
export const RANGE_LABEL = '#f5b27a'

// ── 3. Stan ───────────────────────────────────────────────────────────────
// Z rampy alarmowej warstwy ryzyka dronowego zostały po jej usunięciu dwie
// barwy, bo niosą je też alerty o maszynach i wiersz gotowości powiadomień:
// czerwień znaczy „dzieje się teraz”, żółć „coś jest nie tak, ale nic nie leci”.
export const ALERT = '#ff4757'
export const WATCH = '#ffc53d'
