import { resolveSource } from '../../../core/utils/resolveSource';

describe('resolveSource', () => {
  it('wraps a string source into { uri } with no headers', () => {
    expect(resolveSource('https://x/v.m3u8')).toEqual({ uri: 'https://x/v.m3u8', headers: undefined });
  });

  it('wraps a string source with the second-arg headers', () => {
    expect(resolveSource('https://x/v.m3u8', { Authorization: 'Bearer t' })).toEqual({
      uri: 'https://x/v.m3u8',
      headers: { Authorization: 'Bearer t' }
    });
  });

  it('returns an object source as-is (its own headers win, second arg ignored)', () => {
    const source = { uri: 'https://x/v.m3u8', headers: { 'X-A': '1' } };
    expect(resolveSource(source, { 'X-B': '2' })).toBe(source);
  });

  it('preserves undefined headers for an object source without headers', () => {
    expect(resolveSource({ uri: 'https://x/v.mp4' })).toEqual({ uri: 'https://x/v.mp4' });
  });
});
