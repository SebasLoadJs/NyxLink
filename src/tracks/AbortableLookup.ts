/** Await a backend lookup without depending on an injected transport to honor
 * AbortSignal. Late resolutions and rejections remain handled by the attached
 * Promise callbacks; abort only controls the caller's wait. */
export function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason ?? new Error('Track lookup cancelled'));
    return new Promise<T>((resolve, reject) => {
        const cleanup = () => signal.removeEventListener('abort', aborted);
        const aborted = () => { cleanup(); reject(signal.reason ?? new Error('Track lookup cancelled')); };
        signal.addEventListener('abort', aborted, { once: true });
        operation.then(
            value => { cleanup(); resolve(value); },
            error => { cleanup(); reject(error); },
        );
        if (signal.aborted) aborted();
    });
}
