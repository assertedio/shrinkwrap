const path = require('path');
const { expect } = require('chai');
const shrinkwrap = require('../lib/shrinkwrap');
const unixFormatPath = require('../lib/utils/unix-format-path');

const RESOURCES_PATH = path.join(__dirname, './resources');

describe('shrinkwrap unit tests', () => {
  it('default dev', async () => {
    const result = await shrinkwrap(path.join(RESOURCES_PATH, 'defaultDev'));
    expect(result).to.eql({
      name: 'shrinkwrap-default-dev',
      version: '1.0.0',
      dependencies: {
        '@npmtest/example': {
          version: '1.0.0',
          integrity: undefined,
          resolved: undefined,
          dev: true,
        },
      },
      requires: true,
    });
  });

  it('dev deps', async () => {
    const result = await shrinkwrap(path.join(RESOURCES_PATH, 'devDep'));
    expect(result).to.eql({
      name: 'npm-test-shrinkwrap-dev-dependency',
      version: '0.0.0',
      requires: true,
      dependencies: {
        request: {
          version: '0.9.0',
          resolved: 'https://registry.npmjs.org/request/-/request-0.9.0.tgz',
          integrity: 'sha1-EEn1mm9GWI5tAwkh+7hMovDCcU4=',
        },
        underscore: {
          version: '1.3.1',
          resolved: 'https://registry.npmjs.org/underscore/-/underscore-1.3.1.tgz',
          integrity: 'sha1-bLiq0Od+tdu/tUsivNhpcwnPlkE=',
        },
      },
    });
  });

  it('empty deps', async () => {
    const result = await shrinkwrap(path.join(RESOURCES_PATH, 'emptyDeps'));
    expect(result).to.eql({
      name: 'shrinkwrap-empty-deps',
      version: '0.0.0',
    });
  });
});
