const path = require('path');
const builder = require('../../');
const { createRunBuildLambda } = require('../../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures', '00-next-image-base-path');

jest.setTimeout(360000);

describe('Image Optimization Vary Headers', () => {
  let buildResult;

  beforeAll(async () => {
    const { buildResult: result } = await runBuildLambda(FIXTURE_DIR);
    buildResult = result;
  });

  it('should include Vary headers for image optimization routes', () => {
    const imageRoutes = buildResult.routes.filter(route => 
      route.src && route.src.includes('_next/image')
    );
    
    expect(imageRoutes.length).toBeGreaterThan(0);
    
    // Check that image routes include Vary headers
    const imageRoutesWithVary = imageRoutes.filter(route => 
      route.headers && route.headers.vary
    );
    
    expect(imageRoutesWithVary.length).toBeGreaterThan(0);
    
    // Verify the Vary header includes Cookie and Authorization
    imageRoutesWithVary.forEach(route => {
      expect(route.headers.vary).toBe('Cookie, Authorization');
    });
  });

  it('should include direct _next/image route with Vary headers', () => {
    const directImageRoutes = buildResult.routes.filter(route => 
      route.src === '/_next/image'
    );
    
    expect(directImageRoutes.length).toBeGreaterThan(0);
    
    directImageRoutes.forEach(route => {
      expect(route.headers).toBeDefined();
      expect(route.headers.vary).toBeDefined();
      expect(route.headers.vary).toBe('Cookie, Authorization');
      expect(route.continue).toBe(true);
    });
  });
});