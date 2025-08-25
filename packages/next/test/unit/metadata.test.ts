import { Files } from '@vercel/build-utils';
import {
  isStaticMetadataRoute,
  isSourceFileStaticMetadata,
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
        expect(isStaticMetadataRoute(`/icon.${ext}-abc123`)).toBe(true);
        expect(isStaticMetadataRoute(`\\icon.${ext}-xyz789`)).toBe(true);
        expect(isStaticMetadataRoute(`/folder/icon.${ext}-def456`)).toBe(true);
      });

      it(`should match icon with numeric and group suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/icon1.${ext}-abc123`)).toBe(true);
        expect(isStaticMetadataRoute(`/icon2.${ext}-xyz789`)).toBe(true);
        expect(isStaticMetadataRoute(`/folder/icon0.${ext}-def456`)).toBe(true);
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
      expect(isStaticMetadataRoute('/icon.png-abc12')).toBe(false);
      expect(isStaticMetadataRoute('/icon.png-abc1234')).toBe(false);
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
        expect(isStaticMetadataRoute(`/apple-icon.${ext}-abc123`)).toBe(true);
        expect(isStaticMetadataRoute(`\\apple-icon.${ext}-xyz789`)).toBe(true);
        expect(isStaticMetadataRoute(`/folder/apple-icon.${ext}-def456`)).toBe(
          true
        );
      });

      it(`should match apple-icon with numeric and group suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/apple-icon1.${ext}-abc123`)).toBe(true);
        expect(isStaticMetadataRoute(`/apple-icon9.${ext}-xyz789`)).toBe(true);
      });
    });

    it('should not match apple-icon with unsupported extensions', () => {
      expect(isStaticMetadataRoute('/apple-icon.ico')).toBe(false);
      expect(isStaticMetadataRoute('/apple-icon.svg')).toBe(false);
      expect(isStaticMetadataRoute('/apple-icon.gif')).toBe(false);
    });

    it('should not match apple-icon with invalid group suffix', () => {
      expect(isStaticMetadataRoute('/apple-icon.png-abc12')).toBe(false);
      expect(isStaticMetadataRoute('/apple-icon.png-abc1234')).toBe(false);
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
        expect(isStaticMetadataRoute(`/opengraph-image.${ext}-abc123`)).toBe(
          true
        );
        expect(isStaticMetadataRoute(`\\opengraph-image.${ext}-xyz789`)).toBe(
          true
        );
        expect(
          isStaticMetadataRoute(`/folder/opengraph-image.${ext}-def456`)
        ).toBe(true);
      });

      it(`should match opengraph-image with numeric and group suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/opengraph-image5.${ext}-abc123`)).toBe(
          true
        );
        expect(isStaticMetadataRoute(`/opengraph-image0.${ext}-xyz789`)).toBe(
          true
        );
      });
    });

    it('should not match opengraph-image with unsupported extensions', () => {
      expect(isStaticMetadataRoute('/opengraph-image.svg')).toBe(false);
      expect(isStaticMetadataRoute('/opengraph-image.webp')).toBe(false);
    });

    it('should not match opengraph-image with invalid group suffix', () => {
      expect(isStaticMetadataRoute('/opengraph-image.png-abc12')).toBe(false);
      expect(isStaticMetadataRoute('/opengraph-image.png-abc1234')).toBe(false);
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
        expect(isStaticMetadataRoute(`/twitter-image.${ext}-abc123`)).toBe(
          true
        );
        expect(isStaticMetadataRoute(`\\twitter-image.${ext}-xyz789`)).toBe(
          true
        );
        expect(
          isStaticMetadataRoute(`/folder/twitter-image.${ext}-def456`)
        ).toBe(true);
      });

      it(`should match twitter-image with numeric and group suffix .${ext}`, () => {
        expect(isStaticMetadataRoute(`/twitter-image3.${ext}-abc123`)).toBe(
          true
        );
        expect(isStaticMetadataRoute(`/twitter-image7.${ext}-xyz789`)).toBe(
          true
        );
      });
    });

    it('should not match twitter-image with unsupported extensions', () => {
      expect(isStaticMetadataRoute('/twitter-image.svg')).toBe(false);
      expect(isStaticMetadataRoute('/twitter-image.webp')).toBe(false);
    });

    it('should not match twitter-image with invalid group suffix', () => {
      expect(isStaticMetadataRoute('/twitter-image.png-abc12')).toBe(false);
      expect(isStaticMetadataRoute('/twitter-image.png-abc1234')).toBe(false);
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

describe('isSourceFileStaticMetadata dynamic route matching', () => {
  const files: Files = {
    'app/blog/[id]/icon.png': { type: 'FileFsRef' } as any,
    'app/blog/[id]/page.tsx': { type: 'FileFsRef' } as any,
    'app/about/icon.png': { type: 'FileFsRef' } as any,
    'app/products/[category]/[item]/icon.png': { type: 'FileFsRef' } as any,
    'app/users/[userId]/settings/opengraph-image.jpg': {
      type: 'FileFsRef',
    } as any,
    'app/dynamic-catch/[...arg]/icon.svg': { type: 'FileFsRef' } as any,
    'app/dynamic-catch-all/[[...arg]]/icon.svg': { type: 'FileFsRef' } as any,
  };

  describe('dynamic route matching', () => {
    it('should match single dynamic segment', () => {
      expect(isSourceFileStaticMetadata('/blog/1/icon.png', files)).toBe(true);
      expect(isSourceFileStaticMetadata('/blog/123/icon.png', files)).toBe(
        true
      );
      expect(isSourceFileStaticMetadata('/blog/abc/icon.png', files)).toBe(
        true
      );
    });

    it('should match deeply nested dynamic routes', () => {
      expect(
        isSourceFileStaticMetadata(
          '/users/123/settings/opengraph-image.jpg',
          files
        )
      ).toBe(true);
      expect(
        isSourceFileStaticMetadata(
          '/users/abc/settings/opengraph-image.jpg',
          files
        )
      ).toBe(true);
    });
  });

  describe('catch-all route matching', () => {
    it('should match catch-all routes [...param] with single segment', () => {
      expect(
        isSourceFileStaticMetadata('/dynamic-catch/single/icon.svg', files)
      ).toBe(true);
    });

    it('should match catch-all routes [...param] with multiple segments', () => {
      expect(
        isSourceFileStaticMetadata('/dynamic-catch/a/b/icon.svg', files)
      ).toBe(true);
      expect(
        isSourceFileStaticMetadata('/dynamic-catch/a/b/c/d/icon.svg', files)
      ).toBe(true);
    });

    it('should not match catch-all routes [...param] with no segments', () => {
      expect(isSourceFileStaticMetadata('/dynamic-catch/icon.svg', files)).toBe(
        false
      );
    });
  });

  describe('optional catch-all route matching', () => {
    it('should match optional catch-all routes [[...param]] with no segments', () => {
      expect(
        isSourceFileStaticMetadata('/dynamic-catch-all/icon.svg', files)
      ).toBe(true);
    });

    it('should match optional catch-all routes [[...param]] with single segment', () => {
      expect(
        isSourceFileStaticMetadata('/dynamic-catch-all/single/icon.svg', files)
      ).toBe(true);
    });

    it('should match optional catch-all routes [[...param]] with multiple segments', () => {
      expect(
        isSourceFileStaticMetadata('/dynamic-catch-all/a/b/icon.svg', files)
      ).toBe(true);
      expect(
        isSourceFileStaticMetadata('/dynamic-catch-all/a/b/c/d/icon.svg', files)
      ).toBe(true);
    });
  });

  describe('static route matching', () => {
    it('should match static routes', () => {
      expect(isSourceFileStaticMetadata('/about/icon.png', files)).toBe(true);
    });
  });

  describe('non-matching cases', () => {
    it('should not match routes with extra segments', () => {
      expect(isSourceFileStaticMetadata('/blog/1/2/icon.png', files)).toBe(
        false
      );
      expect(
        isSourceFileStaticMetadata(
          '/products/electronics/laptop/extra/favicon.ico',
          files
        )
      ).toBe(false);
    });

    it('should not match routes with missing segments', () => {
      expect(isSourceFileStaticMetadata('/blog/icon.png', files)).toBe(false);
      expect(isSourceFileStaticMetadata('/products/favicon.ico', files)).toBe(
        false
      );
    });

    it('should not match unknown routes', () => {
      expect(isSourceFileStaticMetadata('/unknown/icon.png', files)).toBe(
        false
      );
      expect(isSourceFileStaticMetadata('/blog/1/unknown.png', files)).toBe(
        false
      );
    });

    it('should not match non-metadata files', () => {
      expect(isSourceFileStaticMetadata('/blog/1/page.tsx', files)).toBe(false);
    });
  });

  describe('with group suffix handling', () => {
    it('should match dynamic routes with group suffix', () => {
      expect(isSourceFileStaticMetadata('/blog/1/icon.png-abc123', files)).toBe(
        true
      );
      expect(
        isSourceFileStaticMetadata(
          '/products/electronics/laptop/icon.png-xyz789',
          files
        )
      ).toBe(true);
    });
  });
});
