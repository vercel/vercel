import { Files } from '@vercel/build-utils';
import {
  isStaticMetadataRoute,
  getSourceFileRefOfStaticMetadata,
  getAppRouterPathnameFilesMap,
} from '../../src/metadata';

describe('isStaticMetadataRoute', () => {
  describe('robots.txt', () => {
    it('should match robots.txt', () => {
      expect(isStaticMetadataRoute('/robots.txt')).toBe(true);
      expect(isStaticMetadataRoute('\\robots.txt')).toBe(true);
    });

    it('should not match robots.txt with additional path segments', () => {
      expect(isStaticMetadataRoute('/robots.txt/extra')).toBe(false);
      expect(isStaticMetadataRoute('/folder/robots.txt')).toBe(false);
    });
  });

  describe('manifest files', () => {
    it('should match manifest.webmanifest', () => {
      expect(isStaticMetadataRoute('/manifest.webmanifest')).toBe(true);
      expect(isStaticMetadataRoute('\\manifest.webmanifest')).toBe(true);
    });

    it('should match manifest.json', () => {
      expect(isStaticMetadataRoute('/manifest.json')).toBe(true);
      expect(isStaticMetadataRoute('\\manifest.json')).toBe(true);
    });

    it('should not match manifest with additional path segments', () => {
      expect(isStaticMetadataRoute('/folder/manifest.json')).toBe(false);
      expect(isStaticMetadataRoute('/manifest.json/extra')).toBe(false);
    });
  });

  describe('favicon.ico', () => {
    it('should match favicon.ico', () => {
      expect(isStaticMetadataRoute('/favicon.ico')).toBe(true);
      expect(isStaticMetadataRoute('\\favicon.ico')).toBe(true);
    });

    it('should not match favicon.ico with additional path segments', () => {
      expect(isStaticMetadataRoute('/folder/favicon.ico')).toBe(false);
      expect(isStaticMetadataRoute('/favicon.ico/extra')).toBe(false);
    });
  });

  describe('sitemap.xml', () => {
    it('should match sitemap.xml', () => {
      expect(isStaticMetadataRoute('/sitemap.xml')).toBe(true);
      expect(isStaticMetadataRoute('\\sitemap.xml')).toBe(true);
      expect(isStaticMetadataRoute('/folder/sitemap.xml')).toBe(true);
    });

    it('should not match sitemap.xml with additional path segments after', () => {
      expect(isStaticMetadataRoute('/sitemap.xml/extra')).toBe(false);
    });
  });

  describe('icon files', () => {
    const iconExtensions = ['ico', 'jpg', 'jpeg', 'png', 'svg'];

    iconExtensions.forEach(ext => {
      it(`should match icon.${ext}`, () => {
        expect(isStaticMetadataRoute(`/icon.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`\\icon.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/folder/icon.${ext}`)).toBe(true);
      });

      it(`should match icon with numeric suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/icon1.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/icon2.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/folder/icon0.${ext}`)).toBe(true);
      });

      it(`should match icon with group suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/icon-abc123.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`\\icon-xyz789.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/folder/icon-def456.${ext}`)).toBe(true);
      });

      it(`should match icon with numeric and group suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/icon1-abc123.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/icon2-xyz789.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/folder/icon0-def456.${ext}`)).toBe(true);
      });
    });

    it('should not match icon with unsupported extensions', () => {
      expect(isStaticMetadataRoute('/icon.gif')).toBe(false);
      expect(isStaticMetadataRoute('/icon.webp')).toBe(false);
    });

    it('should not match icon with additional path segments after', () => {
      expect(isStaticMetadataRoute('/icon.png/extra')).toBe(false);
    });

    it('should not match icon with invalid group suffix', () => {
      expect(isStaticMetadataRoute('/icon-abc12.png')).toBe(false);
      expect(isStaticMetadataRoute('/icon-abc1234.png')).toBe(false);
    });
  });

  describe('apple-icon files', () => {
    const appleExtensions = ['jpg', 'jpeg', 'png'];

    appleExtensions.forEach(ext => {
      it(`should match apple-icon.${ext}`, () => {
        expect(isStaticMetadataRoute(`/apple-icon.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`\\apple-icon.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/folder/apple-icon.${ext}`)).toBe(true);
      });

      it(`should match apple-icon with numeric suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/apple-icon1.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/apple-icon9.${ext}`)).toBe(true);
      });

      it(`should match apple-icon with group suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/apple-icon-abc123.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`\\apple-icon-xyz789.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/folder/apple-icon-def456.${ext}`)).toBe(
          true
        );
      });

      it(`should match apple-icon with numeric and group suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/apple-icon1-abc123.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/apple-icon9-xyz789.${ext}`)).toBe(true);
      });
    });

    it('should not match apple-icon with unsupported extensions', () => {
      expect(isStaticMetadataRoute('/apple-icon.ico')).toBe(false);
      expect(isStaticMetadataRoute('/apple-icon.svg')).toBe(false);
      expect(isStaticMetadataRoute('/apple-icon.gif')).toBe(false);
    });

    it('should not match apple-icon with invalid group suffix', () => {
      expect(isStaticMetadataRoute('/apple-icon-abc12.png')).toBe(false);
      expect(isStaticMetadataRoute('/apple-icon-abc1234.png')).toBe(false);
    });
  });

  describe('opengraph-image files', () => {
    const ogExtensions = ['jpg', 'jpeg', 'png', 'gif'];

    ogExtensions.forEach(ext => {
      it(`should match opengraph-image.${ext}`, () => {
        expect(isStaticMetadataRoute(`/opengraph-image.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`\\opengraph-image.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/folder/opengraph-image.${ext}`)).toBe(
          true
        );
      });

      it(`should match opengraph-image with numeric suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/opengraph-image5.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/opengraph-image0.${ext}`)).toBe(true);
      });

      it(`should match opengraph-image with group suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/opengraph-image-abc123.${ext}`)).toBe(
          true
        );
        expect(isStaticMetadataRoute(`\\opengraph-image-xyz789.${ext}`)).toBe(
          true
        );
        expect(
          isStaticMetadataRoute(`/folder/opengraph-image-def456.${ext}`)
        ).toBe(true);
      });

      it(`should match opengraph-image with numeric and group suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/opengraph-image5-abc123.${ext}`)).toBe(
          true
        );
        expect(isStaticMetadataRoute(`/opengraph-image0-xyz789.${ext}`)).toBe(
          true
        );
      });
    });

    it('should not match opengraph-image with unsupported extensions', () => {
      expect(isStaticMetadataRoute('/opengraph-image.svg')).toBe(false);
      expect(isStaticMetadataRoute('/opengraph-image.webp')).toBe(false);
    });

    it('should not match opengraph-image with invalid group suffix', () => {
      expect(isStaticMetadataRoute('/opengraph-image-abc12.png')).toBe(false);
      expect(isStaticMetadataRoute('/opengraph-image-abc1234.png')).toBe(false);
    });
  });

  describe('twitter-image files', () => {
    const twitterExtensions = ['jpg', 'jpeg', 'png', 'gif'];

    twitterExtensions.forEach(ext => {
      it(`should match twitter-image.${ext}`, () => {
        expect(isStaticMetadataRoute(`/twitter-image.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`\\twitter-image.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/folder/twitter-image.${ext}`)).toBe(
          true
        );
      });

      it(`should match twitter-image with numeric suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/twitter-image3.${ext}`)).toBe(true);
        expect(isStaticMetadataRoute(`/twitter-image7.${ext}`)).toBe(true);
      });

      it(`should match twitter-image with group suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/twitter-image-abc123.${ext}`)).toBe(
          true
        );
        expect(isStaticMetadataRoute(`\\twitter-image-xyz789.${ext}`)).toBe(
          true
        );
        expect(
          isStaticMetadataRoute(`/folder/twitter-image-def456.${ext}`)
        ).toBe(true);
      });

      it(`should match twitter-image with numeric and group suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/twitter-image3-abc123.${ext}`)).toBe(
          true
        );
        expect(isStaticMetadataRoute(`/twitter-image7-xyz789.${ext}`)).toBe(
          true
        );
      });
    });

    it('should not match twitter-image with unsupported extensions', () => {
      expect(isStaticMetadataRoute('/twitter-image.svg')).toBe(false);
      expect(isStaticMetadataRoute('/twitter-image.webp')).toBe(false);
    });

    it('should not match twitter-image with invalid group suffix', () => {
      expect(isStaticMetadataRoute('/twitter-image-abc12.png')).toBe(false);
      expect(isStaticMetadataRoute('/twitter-image-abc1234.png')).toBe(false);
    });
  });

  describe('non-metadata routes', () => {
    it('should not match regular files', () => {
      expect(isStaticMetadataRoute('/index.html')).toBe(false);
      expect(isStaticMetadataRoute('/styles.css')).toBe(false);
      expect(isStaticMetadataRoute('/script.js')).toBe(false);
    });

    it('should not match similar but incorrect filenames', () => {
      expect(isStaticMetadataRoute('/robots-txt')).toBe(false);
      expect(isStaticMetadataRoute('/my-manifest.json')).toBe(false);
      expect(isStaticMetadataRoute('/my-icon.png')).toBe(false);
      expect(isStaticMetadataRoute('/icon-large.png')).toBe(false);
    });

    it('should not match empty or invalid paths', () => {
      expect(isStaticMetadataRoute('')).toBe(false);
      expect(isStaticMetadataRoute('/')).toBe(false);
    });
  });
});

describe('getSourceFileRefOfStaticMetadata dynamic route matching', () => {
  const files: Files = {
    'app/blog/[id]/icon.png': {
      type: 'FileFsRef',
      fsPath: 'app/blog/[id]/icon.png',
    } as any,
    'app/blog/[id]/page.tsx': {
      type: 'FileFsRef',
      fsPath: 'app/blog/[id]/page.tsx',
    } as any,
    'app/about/icon.png': {
      type: 'FileFsRef',
      fsPath: 'app/about/icon.png',
    } as any,
  };
  const appPathnameFilesMap = getAppRouterPathnameFilesMap(files);

  describe('dynamic route matching', () => {
    it('should match single dynamic segment', () => {
      expect(
        getSourceFileRefOfStaticMetadata(
          '/blog/[id]/icon.png',
          appPathnameFilesMap
        )
      ).toBeDefined();
      expect(
        getSourceFileRefOfStaticMetadata(
          '/blog/random/icon.png',
          appPathnameFilesMap
        )
      ).toBeUndefined();
    });

    it('should match deeply nested dynamic routes', () => {
      expect(
        getSourceFileRefOfStaticMetadata(
          '/users/123/settings/opengraph-image.jpg',
          appPathnameFilesMap
        )
      ).toBeUndefined();
      expect(
        getSourceFileRefOfStaticMetadata(
          '/users/abc/settings/opengraph-image.jpg',
          appPathnameFilesMap
        )
      ).toBeUndefined();
    });
  });

  describe('static route matching', () => {
    it('should match static routes', () => {
      expect(
        getSourceFileRefOfStaticMetadata('/about/icon.png', appPathnameFilesMap)
      ).toBeDefined();
    });
  });

  describe('non-matching cases', () => {
    it('should not match routes with extra segments', () => {
      expect(
        getSourceFileRefOfStaticMetadata(
          '/blog/1/2/icon.png',
          appPathnameFilesMap
        )
      ).toBeUndefined();
      expect(
        getSourceFileRefOfStaticMetadata(
          '/products/electronics/laptop/extra/favicon.ico',
          appPathnameFilesMap
        )
      ).toBeUndefined();
    });

    it('should not match routes with missing segments', () => {
      expect(
        getSourceFileRefOfStaticMetadata('/blog/icon.png', appPathnameFilesMap)
      ).toBeUndefined();
      expect(
        getSourceFileRefOfStaticMetadata(
          '/products/favicon.ico',
          appPathnameFilesMap
        )
      ).toBeUndefined();
    });

    it('should not match unknown routes', () => {
      expect(
        getSourceFileRefOfStaticMetadata(
          '/unknown/icon.png',
          appPathnameFilesMap
        )
      ).toBeUndefined();
      expect(
        getSourceFileRefOfStaticMetadata(
          '/blog/1/unknown.png',
          appPathnameFilesMap
        )
      ).toBeUndefined();
    });

    it('should not match non-metadata files', () => {
      expect(
        getSourceFileRefOfStaticMetadata(
          '/blog/1/page.tsx',
          appPathnameFilesMap
        )
      ).toBeUndefined();
    });
  });

  describe('with group suffix handling', () => {
    it('should match dynamic routes with group suffix', () => {
      expect(
        getSourceFileRefOfStaticMetadata(
          '/blog/[id]/icon.png',
          appPathnameFilesMap
        )
      ).toBeDefined();
      expect(
        getSourceFileRefOfStaticMetadata(
          '/blog/1/icon-xyz789.png',
          appPathnameFilesMap
        )
      ).toBeUndefined();
    });
  });
});
