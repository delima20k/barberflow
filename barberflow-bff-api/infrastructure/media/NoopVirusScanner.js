'use strict';

/**
 * NoopVirusScanner - porta segura por interface; trocar por ClamAV no ambiente.
 */
class NoopVirusScanner {
  async scan() {
    return { infected: false, engine: 'noop' };
  }
}

module.exports = { NoopVirusScanner };
