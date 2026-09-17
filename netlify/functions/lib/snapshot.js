// Klucz wspólnego snapshotu ruchu w Blobs. Mieszka osobno, bo czytają go dwie
// strony: `aircraft.js`, które ten snapshot zapisuje, i `threatState.js`, które
// z niego korzysta. Jeden kształt klucza w jednym miejscu, żeby oba końce nie
// rozjechały się po cichu — a przy okazji cron powiadomień nie musi wciągać
// całego modułu aircraft.js tylko po tę jedną funkcję.
export function snapshotKey(lat, lon, radiusKm) {
  return `live-${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}_${radiusKm}`
}
