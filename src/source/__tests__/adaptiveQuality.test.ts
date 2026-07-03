import { describe, expect, it } from '@jest/globals';
import { DEFAULT_ADAPTIVE_QUALITY_CONFIG, resolveAdaptiveDecision, resolveAdaptiveQualityConfig } from '../adaptiveQuality';

describe('resolveAdaptiveDecision', () => {
  it('keeps low until enough samples cross the up threshold', () => {
    expect(
      resolveAdaptiveDecision({
        estimateBps: DEFAULT_ADAPTIVE_QUALITY_CONFIG.upThresholdBps,
        samples: 2,
        previous: 'low'
      })
    ).toBe('low');
    expect(
      resolveAdaptiveDecision({
        estimateBps: DEFAULT_ADAPTIVE_QUALITY_CONFIG.upThresholdBps,
        samples: 3,
        previous: 'low'
      })
    ).toBe('high');
  });

  it('keeps high through the hysteresis band', () => {
    expect(
      resolveAdaptiveDecision({
        estimateBps: 10_000_000,
        samples: 3,
        previous: 'high'
      })
    ).toBe('high');
  });

  it('drops high below the down threshold', () => {
    expect(
      resolveAdaptiveDecision({
        estimateBps: 8_999_999,
        samples: 3,
        previous: 'high'
      })
    ).toBe('low');
  });

  it('keeps the previous decision when there are no samples', () => {
    expect(
      resolveAdaptiveDecision({
        estimateBps: 0,
        samples: 0,
        previous: 'high'
      })
    ).toBe('high');
    expect(
      resolveAdaptiveDecision({
        estimateBps: 50_000_000,
        samples: 0,
        previous: 'low'
      })
    ).toBe('low');
  });

  it('uses custom thresholds and sanitizes invalid config values', () => {
    expect(
      resolveAdaptiveDecision({
        estimateBps: 11_000_000,
        samples: 3,
        previous: 'low',
        config: { upThresholdBps: 11_000_000 }
      })
    ).toBe('high');
    expect(resolveAdaptiveQualityConfig({ highMaxBitrate: Number.NaN }).highMaxBitrate).toBe(DEFAULT_ADAPTIVE_QUALITY_CONFIG.highMaxBitrate);
  });
});
