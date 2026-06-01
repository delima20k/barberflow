'use strict';

module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist/vite',
      numberOfRuns: 1,
      url: ['http://localhost/apps/profissional/index.html'],
      settings: {
        preset: 'desktop',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.8 }],
        'total-blocking-time': ['warn', { maxNumericValue: 500 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: './docs/perf/fase-3/lhci',
    },
  },
};
