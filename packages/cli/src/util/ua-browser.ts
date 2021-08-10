import { platform, release } from 'os';

const getOSVersion = () => {
  if (platform() === 'win32') {
    return `(Windows NT ${release()})`;
  } else if (platform() === 'darwin') {
    return `(Macintosh; Intel MAC OS X ${release()})`;
  } else if (platform() === 'linux') {
    return `(X11; Linux ${release()})`;
  }
};

export default `Mozilla/5.0 ${getOSVersion()}`;
