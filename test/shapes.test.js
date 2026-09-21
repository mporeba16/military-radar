import { describe, it, expect } from 'vitest'
import { getShapeKey, SHAPES, countryFromHex, countryFlag } from '../src/components/aircraftShapes.js'
import { getCommonName, typeLabel } from '../src/lib/typeNames.js'

// C-390 Millennium przychodzi z adsb.fi pod fabrycznym oznaczeniem Embraera
// (t: "E390", desc: "EMBRAER EMB-390"), a nie pod wojskowym C390/KC390. Reguła
// dla regionalnych Embraerów łapała ten kod pierwsza i dawała transportowcowi
// ikonę o połowę mniejszą niż reszta floty.
describe('C-390 Millennium', () => {
  it('E390 dostaje własny kształt, nie regionalnego odrzutowca', () => {
    expect(getShapeKey('E390')).toBe('c390')
  })

  it('wojskowe oznaczenia tej samej maszyny trafiają tam samo', () => {
    for (const t of ['C390', 'C39M', 'KC390', 'KC39']) {
      expect(getShapeKey(t)).toBe('c390')
    }
  })

  it('kontur jest pochodną C-17, więc dzieli z nim układ współrzędnych', () => {
    expect(SHAPES.c390.cx).toBe(SHAPES.c17.cx)
    expect(SHAPES.c390.cy).toBe(SHAPES.c17.cy)
    expect(SHAPES.c390.scale).toBeLessThan(SHAPES.c17.scale)
  })

  it('ma nazwę własną, więc powiadomienie nie mówi „E390"', () => {
    expect(getCommonName('E390')).toBe('C-390 Millennium')
  })
})

describe('rodzina E-Jet zostaje przy swoim kształcie', () => {
  it('regionalne Embraery i pochodne DC-9 nadal używają e390', () => {
    for (const t of ['E170', 'E175', 'E190', 'E195', 'E290', 'E295', 'MD80', 'DC9']) {
      expect(getShapeKey(t)).toBe('e390')
    }
  })
})

// Kształt e390 rysował się w 14,4 px szerokości, gdy cała reszta floty mieści
// się w 23–44 px. Skala liczona jest wprost ze ścieżki, więc pilnujemy jej
// wartości — pomiar w przeglądarce dał po zmianie 23,6 px.
describe('skala kształtów', () => {
  it('e390 nie jest już o połowę mniejszy od pozostałych', () => {
    expect(SHAPES.e390.scale).toBeGreaterThan(0.13)
  })

  it('każdy kształt ma komplet pól potrzebnych do złożenia ikony', () => {
    for (const [name, s] of Object.entries(SHAPES)) {
      expect(s.path, name).toBeDefined()
      expect(typeof s.scale, name).toBe('number')
      expect(s.scale, name).toBeGreaterThan(0)
      expect(typeof s.cx, name).toBe('number')
      expect(typeof s.cy, name).toBe('number')
    }
  })
})

describe('getCommonName — desygnatory ICAO z adsb.fi', () => {
  // adsb.fi podaje kody ICAO (K35R), nie potoczne oznaczenia (KC-135). Bez tych
  // wariantów powiadomienie i powód alertu pokazywały surowy kod typu.
  it('rozpoznaje warianty tankowców i rozpoznania', () => {
    expect(getCommonName('K35R')).toBe('Stratotanker')
    expect(getCommonName('K35E')).toBe('Stratotanker')
    expect(getCommonName('C30J')).toBe('C-130J Hercules')
    expect(getCommonName('B1')).toBe('Lancer')
    expect(getCommonName('B1B')).toBe('Lancer')
    expect(getCommonName('GLF5')).toBe('Gulfstream')
    expect(typeLabel('A345')).toBe('Airbus A340')
    expect(getCommonName('SA342')).toBe('Gazelle')
    expect(getCommonName('B190')).not.toBe('Lancer')
    expect(typeLabel('C30J')).toBe('C-130J Hercules')
    expect(getCommonName('C130')).toBe('Hercules')
    expect(getCommonName('R135')).toBe('Rivet Joint')
    expect(getCommonName('E3TF')).toBe('Sentry (AWACS)')
    expect(getCommonName('K46')).toBe('Pegasus')
    expect(getCommonName('E8C')).toBe('J-STARS')
  })

  it('nazywa śmigłowce podane samym kodem rodziny', () => {
    // ADS-B podaje H60/H47/H64/H53 bez litery roli — te maszyny zostawały
    // wtedy bez nazwy własnej (GRZLY81 jako „H47", DRAGO67 jako „H60").
    expect(getCommonName('H60')).toBe('Black Hawk')
    expect(getCommonName('H47')).toBe('Chinook')
    expect(getCommonName('H64')).toBe('Apache')
    expect(getCommonName('H53')).toBe('Super Stallion')
    expect(getCommonName('MH60')).toBe('Black Hawk')
    expect(typeLabel('H47')).toBe('H47 · Chinook')
  })

  it('nie myli kodów rodziny z cywilnymi Airbusami H1xx', () => {
    // H125/H135/H145/H160/H175 to Eurocopter/Airbus — nie wolno ich wciągnąć
    // pod wojskową regułę na „H" plus liczba.
    expect(getCommonName('H145')).toBe('H145')
    expect(getCommonName('H160')).toBe('H160')
    expect(getCommonName('H125')).toBeNull()
  })

  it('nie łapie przy okazji maszyn cywilnych', () => {
    expect(getCommonName('B738')).toBeNull()
    expect(getCommonName('A332')).toBeNull()
    expect(getCommonName('A320')).toBeNull()
  })
})

describe('kategoria emitera ADS-B', () => {
  // Maszyny bez kodu typu (Mode-S, MLAT, spoza bazy) dostawały domyślnie
  // sylwetkę odrzutowca — tak polski Mi-8 wychodził na mapie jako samolot.
  // A7 nadaje sama maszyna, więc jest pewniejsze niż jakakolwiek heurystyka.
  it('A7 bez kodu typu daje śmigłowiec, nie odrzutowiec', () => {
    expect(getShapeKey('', null, 'A7')).toBe('helicopter')
    expect(getShapeKey(null, null, 'a7')).toBe('helicopter')
  })

  it('kod typu ma pierwszeństwo przed kategorią', () => {
    // Mi-24 ma własną sylwetkę i kategoria nie może jej nadpisać.
    expect(getShapeKey('MI24', null, 'A7')).toBe('mil24')
  })

  it('bez kategorii nic się nie zmienia', () => {
    expect(getShapeKey('', null, null)).toBe('jet_swept')
    expect(getShapeKey('', null, 'A3')).toBe('jet_swept')
  })
})

describe('typeLabel — etykieta typu na karcie', () => {
  it('nie powtarza oznaczenia, które niesie już nazwa', () => {
    // „AN28 · M28 Bryza / An-28" mówiło to samo trzy razy.
    expect(typeLabel('AN28')).toBe('M28 Bryza')
    expect(typeLabel('M28')).toBe('M28 Bryza')
    expect(typeLabel('E390')).toBe('C-390 Millennium')
    expect(typeLabel('A310')).toBe('A310 MRTT')
    expect(typeLabel('RQ4')).toBe('RQ-4 Global Hawk')
  })

  it('oznaczenie zwalnia z kodu także wtedy, gdy nie stoi na początku', () => {
    // Nazwa z wytwórnią z przodu też niesie oznaczenie typu — inaczej karta
    // pisała „MIRF · Mirage F1" i powtarzała to, co i tak widać obok.
    expect(typeLabel('C295')).toBe('CASA CN-295')
    expect(typeLabel('M339')).toBe('Aermacchi MB-339')
    expect(typeLabel('F2')).toBe('Mitsubishi F-2')
    // Nazwa bez oznaczenia dalej dostaje kod — „Bell 407" nie jest typem.
    expect(typeLabel('B407')).toBe('B407 · Bell 407')
  })

  it('dokłada kod, gdy nazwa własna go nie niesie', () => {
    expect(typeLabel('C17')).toBe('C17 · Globemaster III')
    expect(typeLabel('E3TF')).toBe('E3TF · Sentry (AWACS)')
    expect(typeLabel('B748')).toBe('B748 · Jumbo Jet')
  })

  it('bez nazwy własnej zostaje sam kod', () => {
    expect(typeLabel('EC35')).toBe('EC35')
    expect(typeLabel('')).toBeNull()
    expect(typeLabel(null)).toBeNull()
  })
})

describe('MD-900 Explorer', () => {
  it('EXPL (np. belgijska policja G17) to śmigłowiec', () => {
    expect(getShapeKey('EXPL')).toBe('helicopter')
    // CN35 = CASA CN-235 (CTM2078) — ta sama ikonka co C-295.
    expect(getShapeKey('CN35')).toBe(getShapeKey('C295'))
    for (const t of ['A342', 'A343', 'A345', 'A346']) expect(getShapeKey(t)).toBe('heavy_4e')
    expect(typeLabel('CN35')).toBe('CASA CN-235')
    expect(typeLabel('EXPL')).toBe('MD-900 Explorer')
  })
})

describe('countryFromHex — tabela ICAO', () => {
  const cases = [
    ['ae0596', 'United States'],   // KC-135
    ['70c08e', 'Oman'],            // C-130J RAFO — wcześniej brak kraju
    ['3f7a10', 'Germany'],
    ['489a20', 'Poland'],
    ['4ca1b2', 'Ireland'],
    ['730123', 'Iran'],            // stara tabela mówiła „Thailand”
    ['760111', 'Pakistan'],        // stara tabela mówiła „China”
    ['008123', 'South Africa'],    // stara tabela mówiła „Egypt”
    ['0a0123', 'Algeria'],         // stara tabela mówiła „Cameroon”
  ]

  it.each(cases)('%s → %s', (hex, country) => {
    expect(countryFromHex(hex)).toBe(country)
  })

  it('daje flagę dla każdego państwa z tabeli', () => {
    for (const [, country] of cases) expect(countryFlag(country)).not.toBe('')
  })

  it('nie zna adresów spoza przydziałów', () => {
    expect(countryFromHex('ffffff')).toBeNull()
    expect(countryFromHex('')).toBeNull()
  })
})

describe('FLAG_MAP — kody krajów', () => {
  // Wycofane kody ISO 3166-1: mają w Intl te same nazwy co obowiązujące, ale
  // żaden system nie ma dla nich flagi — zamiast niej widać dwa kwadraty.
  const RETIRED = ['FX', 'AN', 'CS', 'YU', 'SU', 'ZR', 'TP', 'DD', 'BU', 'NT', 'UK', 'EU']
  const codeOf = flag => [...flag].map(ch => String.fromCharCode(ch.codePointAt(0) - 0x1F1E6 + 65)).join('')

  it('nie używa wycofanych kodów', () => {
    for (const country of ['France', 'Germany', 'Poland', 'United States', 'Oman', 'Serbia']) {
      const flag = countryFlag(country)
      expect(flag, country).not.toBe('')
      expect(RETIRED, `${country} → ${codeOf(flag)}`).not.toContain(codeOf(flag))
    }
  })

  it('Francja ma FR', () => {
    expect(countryFlag('France')).toBe('🇫🇷')
  })
})

describe('Mi-8 / Mi-17', () => {
  it('nazywa rodzinę oboma oznaczeniami, nie samym „Hip”', () => {
    expect(getCommonName('MI8')).toBe('Mi-8 · Mi-17')
    // Etykieta na karcie nie może zgubić drugiego oznaczenia przy ucinaniu.
    expect(typeLabel('MI8')).toBe('Mi-8 · Mi-17')
    // Kod MI17 jest jednoznaczny — wtedy podajemy konkretną wersję.
    expect(typeLabel('MI17')).toBe('Mi-17')
  })
})
