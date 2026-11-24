import { createConsola } from 'consola';
import type { StructuredLogSink } from './ConsoleReporter';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { LogObject } from 'consola';
import { createBanner } from './Banner';
import { formatEntry, formatArgs, formatBox, formatSystemStatus, formatFailover, type FormatterOptions, type AudioNodeStatus, type FailoverReport } from './LogFormatter';
import { consolaLevels, type NyxLogLevel } from './LogLevels';
import { JsonLogTransport, writeLogLine } from './JsonLogTransport';
import { diagnoseError, type ErrorDiagnostic } from './ErrorDiagnostics';
import { formatDashboardObservation, formatErrorDiagnostic } from './TerminalFormatter';
import { formatPlayerTrace, type PlayerTraceOptions } from './PlayerTrace';
import { LogPipeline, safeLogValue, type LogContext, type LogTransport, type StructuredLogRecord } from './StructuredLog';
import type { Manager } from '../core/Manager';
import { AuroraEvents, type AuroraPinoTarget, type AuroraEvent } from './AuroraEvents';
import { NodeState } from '../typings/types';
import { terminalColor, terminalDepth, trueColor } from './TerminalCapabilities';
import { formatStartupObservation } from './TerminalFormatter';
import { version } from '../..';

export type LoggerOptions = {
  colorDepth?: 4 | 24;
  /** Emit an observed startup snapshot after Manager.init (does not wait for node readiness). */
  startup?: boolean;
  level?: NyxLogLevel;
  color?: boolean;
  timestamps?: boolean;
  width?: number;
  /** Detail level is independent of output format and destination. */
  profile?: LogProfile;
  mode?: 'pretty' | 'json';
  unicode?: boolean;
  context?: LogContext;
  transports?: readonly LogTransport[];
  /** Legacy synchronous sanitized sink; mutually exclusive with custom transports. */
  sink?: StructuredLogSink;
  /** Defaults to false when custom transports are supplied. */
  console?: boolean;
  maxQueue?: number;
  /** Opt-in retention only. Default 0 retains no history. */
  timelineLimit?: number;
  transportTimeoutMs?: number;
  onTransportError?: (error: Error) => void;
  sampleRate?: number;
  deduplicateMs?: number;
  layout?: 'compact' | 'standard' | 'detailed' | 'diagnostic';
};

export type LogProfile = 'silent' | 'minimal' | 'standard' | 'verbose' | 'debug' | 'trace' | 'diagnostic';
const profiles: Record<LogProfile, NyxLogLevel> = {
  silent: 'silent', minimal: 'warn', standard: 'info', verbose: 'debug', debug: 'debug', trace: 'trace', diagnostic: 'trace',
};
const sharedPipeline: unique symbol = Symbol('loggerPipeline');
type ChildLoggerOptions = LoggerOptions & { [sharedPipeline]?: LogPipeline };

function ascii(text: string): string {
  return text.replace(/[┌┐└┘├┤┬┴┼╭╮╰╯]/g, '+').replace(/[│║]/g, '|').replace(/[─═]/g, '-').replace(/[●•·]/g, '*');
}

export type DebugSource = {
  on(event: 'debug', listener: (message: string) => void): unknown;
  off?(event: 'debug', listener: (message: string) => void): unknown;
  removeListener?(event: 'debug', listener: (message: string) => void): unknown;
};

/**
 * Configurable logging facade, independent of any Discord bot.
 * Never writes automatically unless log methods are called and the level permits.
 * Default is silent: libraries shouldn't print into their host's terminal.
 */
export class Logger {
  private readonly instance: ReturnType<typeof createConsola>;
  private readonly options: FormatterOptions & { level: NyxLogLevel };
  private readonly configuration: LoggerOptions;
  private pipeline: LogPipeline;
  private ownsPipeline = true;
  private readonly disposers = new Set<() => void>();
  private readonly managers = new WeakMap<Manager, () => void>();
  private closed = false;
  private currentLevel: NyxLogLevel;

  constructor(options: LoggerOptions = {}) {
    if (options.sink && options.transports?.length) throw new TypeError('Select legacy sink or custom transports, not both');
    const level = options.level ?? (options.profile ? profiles[options.profile] : 'silent');
    if (!Object.prototype.hasOwnProperty.call(consolaLevels, level)) throw new TypeError('Invalid logger level');
    if (options.profile !== undefined && !Object.prototype.hasOwnProperty.call(profiles, options.profile)) throw new TypeError('Invalid logging profile');
    if (options.mode !== undefined && options.mode !== 'pretty' && options.mode !== 'json') throw new TypeError('Invalid logging mode');
    if (options.width !== undefined && (!Number.isFinite(options.width) || options.width < 20 || options.width > 500)) throw new TypeError('Invalid logger width');
    if (options.layout !== undefined && !['compact', 'standard', 'detailed', 'diagnostic'].includes(options.layout)) throw new TypeError('Invalid logger layout');
    if (options.colorDepth !== undefined && options.colorDepth !== 4 && options.colorDepth !== 24) throw new TypeError('Invalid color depth');
    if (options.startup !== undefined && typeof options.startup !== 'boolean') throw new TypeError('Invalid startup option');
    this.configuration = { ...options, transports: options.transports ? [...options.transports] : undefined, context: safeLogValue(options.context ?? {}) as LogContext };
    this.options = {
      color: terminalColor(options.color),
      timestamps: options.layout === 'compact' ? false : options.timestamps ?? true,
      width: options.width ?? Math.max(20, Math.min(106, process.stdout.columns || 72)),
      level,
    };
    this.currentLevel = this.options.level!;
    const parent = (options as ChildLoggerOptions)[sharedPipeline];
    const transports = parent ? [] : [...(options.transports ?? [])];
    if (!parent && (options.console ?? transports.length === 0)) {
      if (options.mode === 'json') transports.push(new JsonLogTransport());
      else transports.push({ write: record => {
        const standardFields = ['nodeId', 'guildId', 'backend', 'traceId', 'status', 'code', 'durationMs', 'positionMs'];
        const visibleContext = options.layout === 'detailed' || options.layout === 'diagnostic' ? record.context :
          Object.fromEntries(standardFields.filter(key => record.context[key] !== undefined).map(key => [key, record.context[key]]));
        const panel = record.event === 'startup.snapshot' ? formatStartupObservation(record.context, this.options, options.layout ?? 'standard') :
          record.event === 'dashboard.snapshot' ? formatDashboardObservation(record.context, this.options, options.layout) :
          record.event === 'error.diagnostic' ? formatErrorDiagnostic(record.context, this.options) : undefined;
        const formatted = panel ?? (record.event === 'panel' || record.event === 'player.trace' || record.event.startsWith('failover.') ? record.message : formatEntry({
          type: ['trace', 'debug', 'info', 'success', 'warn', 'error'].includes(record.event) ? record.event : record.level, tag: record.component, date: new Date(record.timestamp),
          args: [record.message, ...(options.layout === 'compact' || !Object.keys(visibleContext).length ? [] : [visibleContext]),
            ...(options.layout === 'diagnostic' ? [{ sequence: record.sequence, event: record.event }] : [])],
        }, this.options));
        const colored = this.options.color && terminalDepth(options.colorDepth) === 24 ? trueColor(formatted) : formatted;
        const output = options.unicode === false ? ascii(colored) : colored;
        return writeLogLine(record.level === 'error' || record.level === 'warn' ? process.stderr : process.stdout, output + '\n');
      } });
    }
    this.pipeline = parent ?? new LogPipeline({ ...options, transports });
    this.ownsPipeline = !parent;
    this.instance = createConsola({
      level: consolaLevels[this.currentLevel],
      throttle: 0,
      reporters: [{ log: entry => this.publish(entry) }],
    });
  }

  setLevel(level: NyxLogLevel): void {
    if (!Object.prototype.hasOwnProperty.call(consolaLevels, level)) throw new TypeError('Invalid logger level');
    this.currentLevel = level;
    this.instance.level = consolaLevels[level];
  }

  private publish(entry: LogObject): void {
    const level = entry.type === 'trace' ? 'trace' : entry.type === 'debug' ? 'debug' :
      entry.level <= 0 ? 'error' : entry.level === 1 ? 'warn' : 'info';
    if (!this.isEnabled(level)) return;
    const args = safeLogValue(entry.args) as unknown[];
    if (entry.type === 'box') {
      const fields = args[1] && typeof args[1] === 'object' && !Array.isArray(args[1]) ? args[1] as Record<string, unknown> : {};
      this.event('info', entry.tag ?? 'Logger', this.configuration.mode === 'json' ? 'box' : 'panel', { fields },
        this.configuration.mode === 'json' ? String(args[0]) : formatBox(String(args[0]), fields, this.options.width));
      return;
    }
    this.event(level, entry.tag ?? 'Logger', entry.type, {}, formatArgs(args));
  }

  isEnabled(level: Exclude<NyxLogLevel, 'silent'>): boolean {
    return !this.closed && !this.pipeline.stats().closed && consolaLevels[this.currentLevel] >= consolaLevels[level];
  }

  /** Emits detached, redacted structured context; never serializes a disabled event. */
  event(level: StructuredLogRecord['level'], component: string, event: string, context: LogContext = {}, message = event): void {
    if (!this.isEnabled(level)) return;
    if (this.configuration.sink) {
      try { this.configuration.sink({ level: consolaLevels[level], type: String(safeLogValue(event)), module: String(safeLogValue(component)), timestamp: new Date().toISOString(), message: String(safeLogValue(message)) }); } catch {}
    }
    this.pipeline.emit(level, component, event, message, { ...this.configuration.context, ...this.pipeline.context(), ...safeLogValue(context) as LogContext });
  }

  child(context: LogContext): Logger {
    const options: ChildLoggerOptions = { ...this.configuration, level: this.currentLevel,
      context: { ...this.configuration.context, ...this.pipeline.context(), ...safeLogValue(context) as LogContext }, [sharedPipeline]: this.pipeline };
    return new Logger(options);
  }

  getStats() { return this.pipeline.stats(); }
  timeline(filter?: { traceId?: string; guildId?: string; limit?: number }): StructuredLogRecord[] { return this.pipeline.timeline(filter); }

  playerTrace(guildId: string, options: PlayerTraceOptions = {}): StructuredLogRecord[] {
    if (typeof guildId !== 'string' || !/^\d{17,20}$/.test(guildId)) throw new TypeError('Invalid trace guild ID');
    const limit = options.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new TypeError('Player trace view limit must be 1..20');
    const records = this.timeline({ guildId, traceId: options.traceId, limit });
    if (this.canShowInfo()) this.event('info', 'Trace', 'player.trace', { guildId, traceId: options.traceId, entries: records.map(record => ({
      sequence: record.sequence, timestamp: record.timestamp, component: record.component, event: record.event,
    })) }, this.configuration.mode === 'json' ? 'Player trace snapshot' : formatPlayerTrace(guildId, records, this.options));
    return records;
  }
  flush(): Promise<void> { return this.pipeline.flush(); }

  reportError(error: unknown, context: LogContext = {}): ErrorDiagnostic {
    const diagnostic = diagnoseError(error, context);
    this.event('error', 'Diagnostics', 'error.diagnostic', { ...diagnostic.context, diagnostic });
    return diagnostic;
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const dispose of this.disposers) { try { dispose(); } catch { /* continue closing other resources */ } }
    this.disposers.clear();
    if (this.ownsPipeline) await this.pipeline.close();
    else await this.pipeline.flush();
  }

  async traceOperation<T>(name: string, operation: (logger: Logger) => T | Promise<T>, context: LogContext = {}): Promise<T> {
    const safeContext = safeLogValue(context) as LogContext;
    const child = this.child({ ...safeContext,
      traceId: this.pipeline.context().traceId ?? safeContext.traceId ?? this.configuration.context?.traceId ?? randomUUID(), operation: name, operationId: randomUUID(),
      ...(this.pipeline.context().operationId ? { parentOperationId: this.pipeline.context().operationId } : {}) });
    const started = performance.now();
    return this.pipeline.run(child.configuration.context ?? {}, async () => {
      child.event('debug', 'Operation', 'operation.started');
      try {
        const value = await operation(child);
        child.event('debug', 'Operation', 'operation.completed', { durationMs: performance.now() - started });
        return value;
      } catch (error) {
        child.event('error', 'Operation', 'operation.failed', { durationMs: performance.now() - started, error });
        throw error;
      }
    });
  }

  private canShowInfo(): boolean {
    return this.isEnabled('info');
  }

  for(module: string) {
    return this.instance.withTag(module);
  }

  info(module: string, message: string, ...args: unknown[]): void {
    this.for(module).info(message, ...args);
  }

  success(module: string, message: string, ...args: unknown[]): void {
    this.for(module).success(message, ...args);
  }

  warn(module: string, message: string, ...args: unknown[]): void {
    this.for(module).warn(message, ...args);
  }

  error(module: string, message: string, ...args: unknown[]): void {
    this.for(module).error(message, ...args);
  }

  debug(module: string, message: string, ...args: unknown[]): void {
    this.for(module).debug(message, ...args);
  }

  trace(module: string, message: string, ...args: unknown[]): void {
    this.for(module).trace(message, ...args);
  }

  box(module: string, title: string, fields: Record<string, unknown>): void {
    this.for(module).box(title, fields);
  }

  banner(): void {
    if (!this.canShowInfo()) return;
    if (this.configuration.mode === 'json') { this.event('info', 'Logger', 'banner'); return; }
    this.event('info', 'Logger', 'panel', {}, this.configuration.unicode === false ? 'NYXLINK / AUDIO CLIENT\nLavalink + NodeLink' : createBanner(false));
  }

  /** Caller provides real node stats; no simulated values are ever generated. */
  systemStatus(nodes: AudioNodeStatus[]): void {
    if (!this.canShowInfo()) return;
    if (this.configuration.mode === 'json') { this.event('info', 'Node', 'cluster.snapshot', { nodes }); return; }
    this.event('info', 'Node', 'panel', {}, formatSystemStatus(nodes, { ...this.options, color: false }));
  }

  /** Only use `recovered` after verified successful recovery. */
  failover(event: FailoverReport): void {
    if (!this.canShowInfo()) return;
    if (this.configuration.mode === 'json') { this.event('info', 'Failover', 'failover.' + event.status, event); return; }
    this.event('info', 'Failover', 'failover.' + event.status, event, formatFailover(event, { ...this.options, color: false }));
  }

  /**
   * Non-invasive adapter for Moonlink's existing manager.on('debug') events.
   * Does not re-emit debug events, avoiding recursion and duplicates.
   * Legacy text is redacted before reaching any configured transport.
   */
  attachLegacyDebug(source: DebugSource): () => void {
    if (this.closed || this.pipeline.stats().closed) return () => {};
    const handle = (message: string) => {
      const module = /^(?:Moonlink\.js|NyxLink)\s*>\s*([A-Za-z][\w]*)/.exec(message)?.[1] ?? 'Legacy';
      this.debug(module, message);
    };
    source.on('debug', handle);
    let detached = false;
    const dispose = () => {
      if (detached) return;
      detached = true;
      if (source.off) source.off('debug', handle);
      else source.removeListener?.('debug', handle);
      this.disposers.delete(dispose);
    };
    this.disposers.add(dispose);
    return dispose;
  }

  /** Show observed state only; a node without backend info is labelled Unknown. */
  startup(manager: Manager): void {
    if (!this.canShowInfo()) return;
    const allNodes = [...manager.nodes.nodes.values()];
    const nodes = allNodes.slice(0, 16).map(node => ({
      id: node.identifier, backend: node.connected ? node.backend?.kind ?? 'unknown' : 'unknown',
      state: NodeState[node.state]?.toLowerCase() ?? 'unknown',
      ...(node.connected && node.latency >= 0 ? { latencyMs: node.latency } : {}),
      players: manager.players.all.filter(player => player.node === node && !player.destroyed).length,
    }));
    this.event('info', 'Core', 'startup.snapshot', { runtime: process.version, packageVersion: version,
      initialized: manager.initialized, configuredNodes: allNodes.length,
      readyNodes: allNodes.filter(node => node.connected && !node.destroyed && node.state === NodeState.READY).length,
      nodes, omittedNodes: allNodes.length - nodes.length,
      ...(this.configuration.layout === 'diagnostic' ? { platform: process.platform, architecture: process.arch, logging: this.getStats() } : {}),
    }, 'NyxLink startup observed');
  }

  /** Show observed state only; a node without backend info is labelled Unknown. */
  managerStatus(manager: Manager): void {
    if (!this.canShowInfo()) return;
    const nodes = [...manager.nodes.nodes.values()];
    this.systemStatus(nodes.map(node => ({
      name: node.identifier,
      backend: node.backend?.kind === 'nodelink' ? 'NodeLink' : node.backend?.kind === 'lavalink' ? 'Lavalink' : 'Unknown',
      state: node.connected
        ? node.state === NodeState.READY ? 'ready' : 'connected'
        : NodeState[node.state]?.toLowerCase() ?? 'disconnected',
      latencyMs: node.latency >= 0 ? node.latency : undefined,
      players: manager.players.all.filter(player => player.node === node && !player.destroyed).length,
    })));
  }

  /** Returns an idempotent disposer; it never re-emits debug messages. */
  attachManager(manager: Manager): () => void {
    if (this.closed || this.pipeline.stats().closed) return () => {};
    const existing = this.managers.get(manager);
    if (existing) return existing;
    // The former listener collection is replaced by the canonical event route.
    // The deprecated transport API receives a projection, not raw Manager debug.
    const legacyNames: Partial<Record<AuroraEvent['eventCode'], string>> = {
      TRACK_STARTED: 'track.started', TRACK_ENDED: 'track.ended',
      NODE_ERROR: 'node.error', NODE_DISCONNECTED: 'node.disconnected',
      QUEUE_ADDED: 'queue.added', QUEUE_ENDED: 'queue.ended',
      PLAYER_RESUMED: 'player.resumed', PLAYER_SEEKED: 'player.seek',
      PLAYER_STOPPED: 'player.stopped', FILTERS_UPDATED: 'filters.updated',
    };
    const deliver = (record: AuroraEvent, message: string): void => {
      const level = record.severity === 'fatal' ? 'error' : record.severity;
      const context = { ...record.sanitizedContext,
        ...(record.operationId ? { operationId: record.operationId } : {}),
        ...(record.durationMs !== undefined ? { durationMs: record.durationMs } : {}),
        ...(record.traceId ? { traceId: record.traceId, spanId: record.spanId } : {}),
      };
      this.event(level, record.category, legacyNames[record.eventCode] ?? record.eventCode, context, message);
    };
    const target: AuroraPinoTarget = { trace: deliver, debug: deliver, info: deliver, warn: deliver, error: deliver, fatal: deliver };
    // The compatibility logger's own level is mutable; the bridge filters at delivery.
    const route = new AuroraEvents({ level: 'trace', target });
    route.attach(manager);
    let detached = false;
    const dispose = () => {
      if (detached) return;
      detached = true;
      route.close();
      this.disposers.delete(dispose);
      this.managers.delete(manager);
    };
    this.disposers.add(dispose);
    this.managers.set(manager, dispose);
    return dispose;
  }
}
