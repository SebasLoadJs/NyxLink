"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.awaitWithAbort = awaitWithAbort;
function awaitWithAbort(operation, signal) {
    return new Promise((resolve, reject) => {
        const cleanup = () => signal.removeEventListener('abort', aborted);
        const aborted = () => { cleanup(); reject(signal.reason ?? new Error('Track lookup cancelled')); };
        signal.addEventListener('abort', aborted, { once: true });
        operation.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
        if (signal.aborted)
            aborted();
    });
}
//# sourceMappingURL=AbortableLookup.js.map