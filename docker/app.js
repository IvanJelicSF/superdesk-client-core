/* eslint-disable */
// Launcher for the docker image. superdesk-client-core is a library — the
// bundles only export `startApp`; a wrapper module has to call it. This one
// is wired in via `importApps` in docker/superdesk.config.js (same mechanism
// the e2e harness uses, see e2e/client/index.js).
import {startApp} from '../scripts/index';

// deferred: this module is imported while scripts/index is still initializing
setTimeout(() => {
    startApp([], {});
});

export default angular.module('main.superdesk', []);
