import { describe, it, expect } from 'vitest'
import { getShapeKey, SHAPES } from '../src/components/aircraftShapes.js'
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
    expect(getCommonName('B190')).not.toBe('Lancer')
    expect(typeLabel('C30J')).toBe('C-130J Hercules')
    expect(getCommonName('C130')).toBe('Hercules')
    expect(getCommonName('R135')).toBe('Rivet Joint')
    expect(getCommonName('E3TF')).toBe('Sentry (AWACS)')
    expect(getCommonName('K46')).toBe('Pegasus')
    expect(getCommonName('E8C')).toBe('J-STARS')
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
    expect(typeLabel('CN35')).toBe('CASA CN-235')
    expect(typeLabel('EXPL')).toBe('MD-900 Explorer')
  })
})
