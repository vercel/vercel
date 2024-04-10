import { parseOsRelease } from '../src/os';

describe('getOsRelease()', () => {
  it('should parse `amazonlinux:2`', async () => {
    const data = `NAME="Amazon Linux"
VERSION="2"
ID="amzn"
ID_LIKE="centos rhel fedora"
VERSION_ID="2"
PRETTY_NAME="Amazon Linux 2"
ANSI_COLOR="0;33"
CPE_NAME="cpe:2.3:o:amazon:amazon_linux:2"
HOME_URL="https://amazonlinux.com/"
SUPPORT_END="2025-06-30"
`;
    const parsed = await parseOsRelease(data);
    expect(parsed).toMatchObject({
      ANSI_COLOR: '0;33',
      CPE_NAME: 'cpe:2.3:o:amazon:amazon_linux:2',
      HOME_URL: 'https://amazonlinux.com/',
      ID: 'amzn',
      ID_LIKE: 'centos rhel fedora',
      NAME: 'Amazon Linux',
      PRETTY_NAME: 'Amazon Linux 2',
      SUPPORT_END: '2025-06-30',
      VERSION: '2',
      VERSION_ID: '2',
    });
  });

  it('should parse `amazonlinux:2023`', async () => {
    const data = `NAME="Amazon Linux"
VERSION="2023"
ID="amzn"
ID_LIKE="fedora"
VERSION_ID="2023"
PLATFORM_ID="platform:al2023"
PRETTY_NAME="Amazon Linux 2023"
ANSI_COLOR="0;33"
CPE_NAME="cpe:2.3:o:amazon:amazon_linux:2023"
HOME_URL="https://aws.amazon.com/linux/"
BUG_REPORT_URL="https://github.com/amazonlinux/amazon-linux-2023"
SUPPORT_END="2028-03-01"
`;
    const parsed = await parseOsRelease(data);
    expect(parsed).toMatchObject({
      NAME: 'Amazon Linux',
      VERSION: '2023',
      ID: 'amzn',
      ID_LIKE: 'fedora',
      VERSION_ID: '2023',
      PLATFORM_ID: 'platform:al2023',
      PRETTY_NAME: 'Amazon Linux 2023',
      ANSI_COLOR: '0;33',
      CPE_NAME: 'cpe:2.3:o:amazon:amazon_linux:2023',
      HOME_URL: 'https://aws.amazon.com/linux/',
      BUG_REPORT_URL: 'https://github.com/amazonlinux/amazon-linux-2023',
      SUPPORT_END: '2028-03-01',
    });
  });

  it('should parse `ubuntu:jammy`', async () => {
    const data = `PRETTY_NAME="Ubuntu 22.04.3 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.3 LTS (Jammy Jellyfish)"
VERSION_CODENAME=jammy
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=jammy
`;
    const parsed = await parseOsRelease(data);
    expect(parsed).toMatchObject({
      PRETTY_NAME: 'Ubuntu 22.04.3 LTS',
      NAME: 'Ubuntu',
      VERSION_ID: '22.04',
      VERSION: '22.04.3 LTS (Jammy Jellyfish)',
      HOME_URL: 'https://www.ubuntu.com/',
      SUPPORT_URL: 'https://help.ubuntu.com/',
      BUG_REPORT_URL: 'https://bugs.launchpad.net/ubuntu/',
      PRIVACY_POLICY_URL:
        'https://www.ubuntu.com/legal/terms-and-policies/privacy-policy',
    });
  });
});
