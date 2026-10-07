import { updateGeoIp } from "../src/lib/i18n/update-geoip";
updateGeoIp().then((result) => console.log("GeoIP:", result)).catch((error) => { console.error(error); process.exitCode = 1; });
