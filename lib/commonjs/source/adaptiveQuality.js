"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.resolveAdaptiveQualityConfig = exports.resolveAdaptiveDecision = exports.DEFAULT_ADAPTIVE_QUALITY_CONFIG = void 0;
const DEFAULT_ADAPTIVE_QUALITY_CONFIG = exports.DEFAULT_ADAPTIVE_QUALITY_CONFIG = {
  upThresholdBps: 14_000_000,
  downThresholdBps: 9_000_000,
  highMaxBitrate: 10_000_000
};
const resolvePositiveNumber = (value, fallback) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
const resolveAdaptiveQualityConfig = config => ({
  upThresholdBps: resolvePositiveNumber(config?.upThresholdBps, DEFAULT_ADAPTIVE_QUALITY_CONFIG.upThresholdBps),
  downThresholdBps: resolvePositiveNumber(config?.downThresholdBps, DEFAULT_ADAPTIVE_QUALITY_CONFIG.downThresholdBps),
  highMaxBitrate: resolvePositiveNumber(config?.highMaxBitrate, DEFAULT_ADAPTIVE_QUALITY_CONFIG.highMaxBitrate)
});
exports.resolveAdaptiveQualityConfig = resolveAdaptiveQualityConfig;
const resolveAdaptiveDecision = ({
  estimateBps,
  samples,
  previous,
  config
}) => {
  if (samples === 0) {
    return previous;
  }
  const resolvedConfig = resolveAdaptiveQualityConfig(config);
  const bps = Number.isFinite(estimateBps) ? estimateBps : 0;
  if (previous === 'low') {
    return samples >= 3 && bps >= resolvedConfig.upThresholdBps ? 'high' : 'low';
  }
  return bps < resolvedConfig.downThresholdBps ? 'low' : 'high';
};
exports.resolveAdaptiveDecision = resolveAdaptiveDecision;
//# sourceMappingURL=adaptiveQuality.js.map