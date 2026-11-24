import { Writable } from 'node:stream';
import { Listr } from 'listr2';
import ora from 'ora';
import cliProgress from 'cli-progress';
import stripAnsi from 'strip-ansi';
import prettyMs from 'pretty-ms';
import { AuroraBootstrap } from 'nyxlink';

// The caller owns the coordinator and its lifetime. Neither Listr2 nor Ora
// writes directly to the terminal. The progress renderer has a private stream.
export async function runAuroraBootstrap(manager, clientId, terminal, options = {}) {
    const lease = terminal.acquire();
    let spinnerTimer;
    let bar;
    let failure;
    let failed = false;
    let result;
    const safe = fn => { try { return fn(); } catch { return undefined; } };
    const stopSpinner = () => { if (spinnerTimer) clearInterval(spinnerTimer); spinnerTimer = undefined; };
    const stopBar = () => { const active = bar; bar = undefined; if (active) safe(() => active.stop()); };
    const snapshots = snapshot => {
        const { phase, ready, total, durationMs } = snapshot;
        if (phase === 'initializing') {
            if (lease) {
                const spinner = ora({ text: 'Initializing manager', spinner: 'line', isSilent: true, color: 'white' });
                safe(() => lease.update(stripAnsi(spinner.frame())));
                spinnerTimer = setInterval(() => safe(() => lease.update(stripAnsi(spinner.frame()))), spinner.interval);
                spinnerTimer.unref?.();
            }
            return;
        }
        stopSpinner();
        if (phase === 'connecting') {
            if (lease && total > 0) {
                if (!bar) {
                    const stream = new Writable({ write(chunk, _encoding, callback) {
                        const frame = stripAnsi(chunk.toString()).replace(/[\r\n]/g, '');
                        if (frame.includes('AUDIO NETWORK')) safe(() => lease.update(frame));
                        callback();
                    } });
                    stream.isTTY = true;
                    stream.columns = 80;
                    bar = new cliProgress.SingleBar({
                        stream, format: 'AUDIO NETWORK [{bar}] {value}/{total}',
                        barsize: 16, barCompleteChar: '=', barIncompleteChar: '-',
                        hideCursor: false, linewrap: null, stopOnComplete: false, clearOnComplete: false,
                        fps: 8,
                    });
                    bar.start(total, ready);
                } else bar.update(ready);
            }
            return;
        }
        stopBar();
        safe(() => terminal.write(
            phase === 'initialized' ? 'Manager initialized (connections requested) · ' + prettyMs(durationMs) :
            'Bootstrap ' + phase + ' · ' + ready + '/' + total + ' ready · ' + prettyMs(durationMs),
            phase === 'initialization-failed' || phase === 'timeout' ? 'critical' : 'normal',
        ));
    };
    const bootstrap = new AuroraBootstrap(manager, { ...options, onSnapshot: snapshots });
    try {
        const tasks = new Listr([
            { title: 'Initialize manager', task: async () => {
                try { await bootstrap.initialize(clientId); }
                catch (error) { failed = true; failure = error; throw error; }
            } },
            { title: 'Observe confirmed nodes', task: async () => { result = await bootstrap.observeNetwork(); } },
        ], { renderer: 'silent', exitOnError: true, registerSignalListeners: false });
        await tasks.run();
        return result;
    } catch (error) {
        throw failed ? failure : error;
    } finally {
        stopSpinner(); stopBar(); safe(() => lease?.release());
    }
}
