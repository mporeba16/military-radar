import { describe, it, expect } from 'vitest'
import { plForm, planeWord, machineWord } from '../src/lib/plural.js'

describe('plForm', () => {
  it('jeden bierze formę pojedynczą', () => {
    expect(plForm(1, 'a', 'b', 'c')).toBe('a')
  })

  it('dwa, trzy i cztery biorą formę mnogą', () => {
    expect(plForm(2, 'a', 'b', 'c')).toBe('b')
    expect(plForm(3, 'a', 'b', 'c')).toBe('b')
    expect(plForm(4, 'a', 'b', 'c')).toBe('b')
  })

  it('zero i pięć w górę biorą dopełniacz', () => {
    expect(plForm(0, 'a', 'b', 'c')).toBe('c')
    expect(plForm(5, 'a', 'b', 'c')).toBe('c')
    expect(plForm(11, 'a', 'b', 'c')).toBe('c')
  })

  it('nastki są wyjątkiem od reguły dwa do czterech', () => {
    expect(plForm(12, 'a', 'b', 'c')).toBe('c')
    expect(plForm(13, 'a', 'b', 'c')).toBe('c')
    expect(plForm(14, 'a', 'b', 'c')).toBe('c')
  })

  it('dziesiątki wyższe wracają do formy mnogiej', () => {
    expect(plForm(22, 'a', 'b', 'c')).toBe('b')
    expect(plForm(103, 'a', 'b', 'c')).toBe('b')
    expect(plForm(112, 'a', 'b', 'c')).toBe('c')
  })
})

describe('planeWord', () => {
  it('odmienia tak, jak robi to serwer w powiadomieniach', () => {
    expect(planeWord(1)).toBe('samolot')
    expect(planeWord(2)).toBe('samoloty')
    expect(planeWord(5)).toBe('samolotów')
    expect(planeWord(0)).toBe('samolotów')
  })
})

describe('machineWord', () => {
  it('odmienia rzeczownik żeński', () => {
    expect(machineWord(1)).toBe('maszyna')
    expect(machineWord(3)).toBe('maszyny')
    expect(machineWord(7)).toBe('maszyn')
  })
})
