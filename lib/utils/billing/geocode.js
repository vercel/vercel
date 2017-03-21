// Packages
const gMaps = require('@google/maps');

const MAPS_API_KEY = 'AIzaSyALfKTQ6AiIoJ8WGDXR3E7IBOwlHoTPfYY';

// eslint-disable-next-line camelcase
module.exports = function({ country, zipCode: postal_code }) {
  return new Promise(resolve => {
    const maps = gMaps.createClient({ key: MAPS_API_KEY });
    maps.geocode(
      {
        address: `${postal_code} ${country}` // eslint-disable-line camelcase
      },
      (err, res) => {
        if (err || res.json.results.length === 0) {
          resolve();
        }

        const data = res.json.results[0];
        const components = {};
        data.address_components.forEach(c => {
          components[c.types[0]] = c;
        });
        const state = components.administrative_area_level_1;
        const city = components.locality;
        resolve({
          state: state && state.long_name,
          city: city && city.long_name
        });
      }
    );
  });
};
