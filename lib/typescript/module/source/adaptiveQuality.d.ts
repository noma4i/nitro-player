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
export declare const DEFAULT_ADAPTIVE_QUALITY_CONFIG: ResolvedAdaptiveQualityConfig;
export declare const resolveAdaptiveQualityConfig: (config?: AdaptiveQualityConfig) => ResolvedAdaptiveQualityConfig;
export declare const resolveAdaptiveDecision: ({ estimateBps, samples, previous, config }: AdaptiveQualityDecisionInput) => AdaptiveQualityDecision;
//# sourceMappingURL=adaptiveQuality.d.ts.map