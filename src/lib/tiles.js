// Podkłady mapy — czysta lista (bez Leafletu i DOM), żeby dało się ją czytać
// także w testach i w panelu Mapy.
//
// Note: no L.Icon.Default config — every marker here is a custom L.divIcon,
// so the default marker/shadow images are never used (removing it also drops
// the only hardcoded unpkg CDN dependency).

// Podkład mapy — jeden, ciemny OpenStreetMap. Wybór spośród sześciu
// podkładów zniknął z panelu Mapy (decyzja użytkownika 06.11.2026): wszyscy
// i tak korzystali z ciemnego, a lista zajmowała pół panelu.
//
// `ownAreaLabels` — kafelki OSM same podpisują obszary (nazwy poligonów przy
// dużym przybliżeniu); nasz podpis ustępuje im wtedy miejsca.
export const BASE_TILE = {
  id: 'osm-adsbx',
  ownAreaLabels: true,
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  filter: 'saturate(0.55) brightness(0.54) contrast(1.1)',
}
