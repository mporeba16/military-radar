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
// Złoto baz jest wyraźnie stłumione względem bursztynu dużych samolotów, bo
// wcześniej był to ten sam kolor i kwadrat bazy mrugał tak samo mocno jak
// lecący An-124.
export const BASE_PL = '#b8933f'
export const BASE_NATO = '#6d95b8'

// Poligony: magenta. To konwencja map lotniczych dla stref ograniczonych, a
// przy okazji jedyna barwa nieużywana nigdzie indziej — czerwień odpadła, bo
// poligon jest terenem stałym, nie zdarzeniem, i nie ma udawać alarmu.
export const RANGE = '#b06ab3'
export const RANGE_LABEL = '#d9a7dc'

// ── 3. Zagrożenie ─────────────────────────────────────────────────────────
export const THREAT = {
  calm: '#2f7f5b',
  watch: '#ffc53d',
  elevated: '#ff8c1a',
  high: '#ff4757',
}

// Jedna czerwień alarmowa na całą aplikację — ta sama, co najwyższy poziom.
export const ALERT = THREAT.high
