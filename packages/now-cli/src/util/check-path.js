// Native
import os from 'os';

import path from 'path';

const checkPath = async dir => {
  if (!dir) {
    return;
  }

  const home = os.homedir();
  let location;

  const paths = {
    home,
    desktop: path.join(home, 'Desktop'),
    downloads: path.join(home, 'Downloads'),
  };

  for (const locationPath in paths) {
    if (!{}.hasOwnProperty.call(paths, locationPath)) {
      continue;
    }

    if (dir === paths[locationPath]) {
      location = locationPath;
    }
  }

  if (!location) {
    return;
  }

  let locationName;

  switch (location) {
    case 'home':
      locationName = 'user directory';
      break;
    case 'downloads':
      locationName = 'downloads directory';
      break;
    default:
      locationName = location;
  }

  throw new Error(`You're trying to deploy your ${locationName}.`);
};

export default checkPath;
