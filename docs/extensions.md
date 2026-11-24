# Optional application extensions

NyxLink accepts trusted in-process extensions without making Redis, logging exporters or other services mandatory. Connectors, search resolvers, storage adapters and log transports retain their existing contracts; this lifecycle does not replace them.

```ts
import type { NyxExtension } from 'nyxlink';
const extension: NyxExtension = {
  name: 'application.track-counter',
  setup({ on, signal }) {
    on('trackStart', (player, track) => {
      // Forward a counter to an application-owned service.
    });
    // Pass signal to any cancellable async work owned by this extension.
  },
  async dispose() {
    // Release application-owned sockets/timers/subscriptions here.
  },
};
const remove = await manager.useExtension(extension);
await remove(); // idempotent, including concurrent calls
```

Names are unique safe ASCII identifiers, 1..64 characters. `useExtension` rejects duplicate/invalid registration and returns an async disposer only after setup succeeds. Hooks installed through `context.on` remain inactive until successful setup. The context supplies the manager, an AbortSignal and typed event registration; detaching a hook is idempotent.

Synchronous/async hook failures are caught and reported through `extensionError(name, error)` as `ExtensionLifecycleError`. They do not abort the playback event or other extension listeners. Errors from an extension's own `extensionError` hook do not recursively emit that event. `code` identifies setup, handler or cleanup failure; the original cause remains available to application error handlers. The logger redacts its serialized diagnostics.

Removal, setup failure, timeout and manager shutdown abort the signal and detach all host-managed listeners. Setup defaults to a 10-second deadline and cleanup to 1 second; `ExtensionOptions` allows 1..60000 ms for either. An extension must honor the signal and release its own resources: the host cannot sandbox code, interrupt synchronous work or forcibly cancel an arbitrary Promise. Late async results are fenced out of host-managed hooks.

Manager shutdown attempts cleanup for all registered extensions and still attempts the remaining manager resources when an extension fails. Lifecycle errors are returned to callers; they are not falsely reported as successful cleanup. Tests cover failed/late setup, duplicate identity, observer isolation, error-recursion prevention, timeout, removal and shutdown.
