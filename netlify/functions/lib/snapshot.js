// Klucz wspólnego snapshotu ruchu w Blobs. Trzymany osobno od `aircraft.js`,
// bo czytał go też usunięty model ryzyka dronowego — i dlatego, że cron
// powiadomień nie musi wciągać całego `aircraft.js` po tę jedną funkcję.
export function snapshotKey(lat, lon, radiusKm) {
  return `live-${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}_${radiusKm}`
}
