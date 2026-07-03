export type AdaptiveQualityDecision = 'high' | 'low';

export interface AdaptiveQualityConfig {
  upThresholdBps?: number;
  downThresholdBps?: number;
  highMaxBitrate?: number;
}

export interface ResolvedAdaptiveQualityConfig {
  upThresholdBps: number;
  downThresholdBps: number;
  highMaxBitrate: number;
}

export interface AdaptiveQualityDecisionInput {
  estimateBps: number;
  samples: number;
  previous: AdaptiveQualityDecision;
  config?: AdaptiveQualityConfig;
}

export const DEFAULT_ADAPTIVE_QUALITY_CONFIG: ResolvedAdaptiveQualityConfig = {
  upThresholdBps: 14_000_000,
  downThresholdBps: 9_000_000,
  highMaxBitrate: 10_000_000
};

const resolvePositiveNumber = (value: number | undefined, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback);

export const resolveAdaptiveQualityConfig = (config?: AdaptiveQualityConfig): ResolvedAdaptiveQualityConfig => ({
  upThresholdBps: resolvePositiveNumber(config?.upThresholdBps, DEFAULT_ADAPTIVE_QUALITY_CONFIG.upThresholdBps),
  downThresholdBps: resolvePositiveNumber(config?.downThresholdBps, DEFAULT_ADAPTIVE_QUALITY_CONFIG.downThresholdBps),
  highMaxBitrate: resolvePositiveNumber(config?.highMaxBitrate, DEFAULT_ADAPTIVE_QUALITY_CONFIG.highMaxBitrate)
});

export const resolveAdaptiveDecision = ({ estimateBps, samples, previous, config }: AdaptiveQualityDecisionInput): AdaptiveQualityDecision => {
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
