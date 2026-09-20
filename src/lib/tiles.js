// Podkłady mapy — czysta lista (bez Leafletu i DOM), żeby dało się ją czytać
// także w testach i w panelu Mapy.
//
// Note: no L.Icon.Default config — every marker here is a custom L.divIcon,
// so the default marker/shadow images are never used (removing it also drops
// the only hardcoded unpkg CDN dependency).

// `ownAreaLabels` — czy dany podkład sam podpisuje obszary (kafelki OSM rysują
// nazwy poligonów przy dużym przybliżeniu). Tam nasz podpis przestaje być
// potrzebny i zaczyna przeszkadzać, więc powyżej progu ustępuje miejsca.
// Podkłady Esri tego nie robią, więc na nich zostaje na każdym przybliżeniu.
export const TILE_LAYERS = [
  {
    id: 'osm-adsbx',
    ownAreaLabels: true,
    name: 'OSM ADSBx',
    label: 'Ciemna',
    sub: 'OpenStreetMap, przyciemniona',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    filter: 'saturate(0.55) brightness(0.54) contrast(1.1)',
  },
  {
    id: 'osm',
    ownAreaLabels: true,
    name: 'OpenStreetMap',
    label: 'Klasyczna',
    sub: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    filter: '',
  },
  {
    id: 'esri-satellite',
    name: 'Esri Satellite',
    label: 'Satelita',
    sub: 'Esri World Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
    maxZoom: 18,
    filter: '',
  },
  {
    id: 'esri-dark',
    name: 'Esri Dark Gray',
    label: 'Neutralna ciemna',
    sub: 'Esri Dark Gray Canvas',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    // Esri publikuje opisy jako OSOBNĄ warstwę — bez niej płótno jest niemal
    // puste i nie widać, nad czym się patrzy.
    overlay: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    maxZoom: 16,
    filter: '',
  },
  {
    // Satelita z nazwami — odpowiednik „hybrydy" z Google Maps. Zdjęcia bez
    // opisów (osobny podkład wyżej) trudno czytać: nie wiadomo, nad którym
    // miastem się patrzy. Opisy i granice to osobna warstwa Esri.
    id: 'esri-hybrid',
    name: 'Esri Hybrid',
    label: 'Satelita z nazwami',
    sub: 'Esri World Imagery + opisy',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    overlay: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
    maxZoom: 18,
    filter: '',
  },
  {
    // Teren w stylu Google Terrain: cieniowany relief z drogami i nazwami.
    // Wcześniej był tu OpenTopoMap — mapa turystyczna z gęstymi poziomicami,
    // czytelna dopiero z bliska, a do tego utrzymywana z darowizn i proszona
    // o oszczędne korzystanie; nasza aplikacja odpytuje kafelki bez przerwy.
    id: 'esri-topo',
    name: 'Esri Topo',
    label: 'Teren',
    sub: 'Esri World Topographic',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, USGS, NRCAN, METI, iPC',
    maxZoom: 19,
    filter: '',
  },
]

// Podkłady, których już nie ma, i ich następcy. Bez tego zapisany wybór
// („Neutralna jasna", stary „Teren" z OpenTopoMap) cicho wracał do pierwszej
// pozycji listy, czyli mapy ciemnej — użytkownik tracił swój podkład bez słowa.
const RETIRED_TILES = {
  'esri-light': 'esri-hybrid',
  'opentopo': 'esri-topo',
}

export function resolveTileId(id) {
  const wanted = RETIRED_TILES[id] || id
  return TILE_LAYERS.some(l => l.id === wanted) ? wanted : TILE_LAYERS[0].id
}

// Miniatura podkładu: jeden prawdziwy kafelek, wyciągnięty z tego samego
// szablonu URL, którego używa mapa. Dzięki temu podgląd pokazuje realny wygląd
// warstwy, a nie jej imitację — a filtr przyciemniający nakłada się na
// miniaturę tak samo jak na mapę.
//
// Kafelek pokazuje Zatokę Gdańską, nie południową Polskę. Poprzedni był samym
// lądem i w zwiniętym wierszu (54 px) wyglądał jak jednolita breja; morze
// obok lądu daje kontrast, który czyta się nawet w tym rozmiarze, a o to
// w miniaturze chodzi — rozpoznać podkład, nie geografię.
const THUMB_TILE = { z: 6, x: 35, y: 20 }
export function tileThumbUrl(layer, which = 'url') {
  const tpl = layer[which]
  if (!tpl) return null
  return tpl
    .replace('{s}', 'a')
    .replace('{z}', String(THUMB_TILE.z))
    .replace('{x}', String(THUMB_TILE.x))
    .replace('{y}', String(THUMB_TILE.y))
    .replace('{r}', '')
}
