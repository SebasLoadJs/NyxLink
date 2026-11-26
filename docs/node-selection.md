# Node selection and caller-scoped hysteresis

Existing strategies and defaults remain unchanged. Weighted selection is opt-in per `findNode`/`NodeSelector.select` call:

```ts
const destination = manager.nodes.findNode({
  backend: 'nodelink',
  requiredCapabilities: ['nextTrack'],
  region: 'us',
  preferSource: 'youtube',
  scoreWeights: { players: 1, cpu: 100, memory: 20, latency: 0.1, priority: 1 },
  preferredNode: currentNode.identifier,
  minimumScoreImprovement: 2,
});
```

Cost is the sum of selected metric × weight: player count, system CPU ratio, used/allocated memory ratio, measured WebSocket latency in milliseconds, and configured priority (lower wins; default zero). Weights must be finite nonnegative numbers up to 1,000,000 with at least one positive weight. Zero disables a metric. Invalid options fail before selection.

CPU/memory/player statistics require a known local `statsReceivedAt` no older than `manager.options.node.maxStatsAgeMs` (default 120,000 ms), and not in the future. Missing, stale, negative or nonfinite telemetry costs Infinity; missing WebSocket latency is not fabricated as zero. Priority may be negative. A finite score beats unknown scores. If every candidate has unknown selected metrics, insertion order remains the fallback; use health/availability requirements to control admission separately.

Eligibility, exclusion, circuit/draining checks, health filtering, readiness, region and source-health preference run before scoring. Hysteresis cannot restore a node removed by those rules. An eligible `preferredNode` with a finite score is retained until the best candidate improves its cost by **more than** `minimumScoreImprovement` (absolute cost units, default zero). The same margin works with existing numerical strategies; random selection ignores the margin unless weighted scoring is requested.

The caller supplies the preference on each call. There is no global sticky node, retained player reference, polling timer or automatic migration. A disconnected node never survives because of hysteresis. Source-health ranking already incorporates observed provider status/circuit state; node circuit breakers remain hard eligibility gates. This API does not invent server worker statistics or promise regional latency from configured region names.

See [pending acceptance](https://github.com/SebasLoadJs/NyxLink/blob/dev/docs/pending-real-world-acceptance.md) for load/region and audible migration exercises.


### Native audio recovery

On migration, the shared playback state is restored independently of NodeLink-only controls. Native fading, crossfade, loudness normalization, audio track selection and extended filters are projected against the destination. Unsupported settings are retained in the live player and omitted from recovery requests; compatible destinations can receive them again. The recovered `playerNodeFailover` report optionally includes `suspendedFeatures` and `manualPreloadDiscarded`. Queue-backed preloads are rebuilt rather than reusing stale source-node encodings.

Explicit native controls remain capability-gated. Applications can use `filters.apply({ compatibleOnly: true })` to apply the compatible subset while preserving the original filter preferences. This is not a guarantee of audible continuity. LavaDSPX compatibility is projected separately; arbitrary plugin filters are not guaranteed portable. See [optional mixer reconstruction](mixer.md#optional-mixer-reconstruction). Real backend/voice acceptance remains required.
