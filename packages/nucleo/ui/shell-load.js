/**
 * What the shell reads on a cold load, and when (#750): each route once, the screen's own reads first.
 *
 * - `shareReads(read)`: a shell read of a route that is already in flight gets that promise, not a second request.
 * - `createScreenGate()`: opens when the first screen has settled (mounted or failed), or after one second, whichever comes first.
 * - `createShellLoad({ gate, loaders })`: reads everything the shell shows once the gate opens; the connection's first
 *   `restart` does not read it again, and a restart after a drop does, once boot has read.
 */

/** #750: wraps the read layer: while a route is being read, another shell read of it shares the promise. A read with options (a screen's signal) is its own. */
export function shareReads(read) {
  const inflight = new Map();
  return (route, options) => {
    if (options) return read(route, options);
    const shared = inflight.get(route);
    if (shared) return shared;
    const promise = read(route);
    inflight.set(route, promise);
    const done = () => inflight.delete(route);
    promise.then(done, done);
    return promise;
  };
}

/** #750: `open()` is called when the first screen settles (mounted or failed); `ready` resolves then, or after `waitMs`. */
export function createScreenGate({ setTimer = setTimeout, clearTimer = clearTimeout, waitMs = 1000 } = {}) {
  let release;
  const ready = new Promise((resolve) => (release = resolve));
  const timer = setTimer(release, waitMs);
  return {
    ready,
    open() {
      clearTimer(timer);
      release();
    },
  };
}

/** #750: `loaders` are the reads of the shell (the version, the machines, the connectors, the GitHub card, the update notice, the counts). */
export function createShellLoad({ gate, loaders }) {
  // #750: the first `restart` is the connection's: boot reads what it shows. A drop makes the next one read again, but only once boot has read.
  let connected = false;
  let booted = false;
  const all = () =>
    Promise.all(
      loaders.map(async (load) => {
        try {
          await load();
        } catch {
          // #750: each read keeps its own last state on a failure; one failing does not stop the others.
        }
      }),
    ).then(() => {});
  return {
    boot: () =>
      gate.ready.then(() => {
        booted = true;
        return all();
      }),
    /** #750: returns whether the screens must re-read; reads the shell again unless this is the connection's first restart or boot has not read yet. */
    restart() {
      if (!connected) return (connected = true), false;
      if (booted) all();
      return true;
    },
    dropped() {
      connected = true;
    },
  };
}
