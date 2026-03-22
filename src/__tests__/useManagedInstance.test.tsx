import { renderHook } from '@testing-library/react';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('react-native-nitro-modules', () => ({ NitroModules: { createHybridObject: jest.fn(), updateMemorySize: jest.fn() } }));
jest.mock('../core/utils/sourceFactory', () => ({ createSource: jest.fn(() => ({ id: 'source' })) }));
jest.mock('../core/utils/playerFactory', () => ({ createPlayer: jest.fn() }));

describe('useManagedInstance', () => {
  let instanceCounter: number;
  let cleanedUp: number[];

  beforeEach(() => {
    instanceCounter = 0;
    cleanedUp = [];
  });

  function makeConfig(deps?: unknown[]) {
    const factory = jest.fn(() => ++instanceCounter);
    const cleanup = jest.fn((obj: number) => { cleanedUp.push(obj); });
    return { factory, cleanup, deps: deps ?? ['dep1'] };
  }

  it('creates instance on mount via factory', () => {
    const { useManagedInstance } = require('../core/hooks/useManagedInstance');
    const { factory, cleanup, deps } = makeConfig();

    const { result } = renderHook(() => useManagedInstance({ factory, cleanup }, deps));

    expect(result.current).toBe(1);
    expect(factory).toHaveBeenCalled();
  });

  it('calls cleanup on unmount', () => {
    const { useManagedInstance } = require('../core/hooks/useManagedInstance');
    const { factory, cleanup, deps } = makeConfig();

    const { unmount } = renderHook(() => useManagedInstance({ factory, cleanup }, deps));

    expect(cleanedUp).toHaveLength(0);

    unmount();

    expect(cleanup).toHaveBeenCalledWith(1);
  });

  it('recreates instance when dependencies change', () => {
    const { useManagedInstance } = require('../core/hooks/useManagedInstance');
    const cleanup = jest.fn((obj: number) => { cleanedUp.push(obj); });
    const factory = jest.fn(() => ++instanceCounter);

    const { result, rerender } = renderHook(
      ({ deps }) => useManagedInstance({ factory, cleanup }, deps),
      { initialProps: { deps: ['a'] } }
    );

    expect(result.current).toBe(1);

    rerender({ deps: ['b'] });

    expect(result.current).toBe(2);
  });

  it('calls cleanup for old instance before creating new', () => {
    const { useManagedInstance } = require('../core/hooks/useManagedInstance');
    const cleanup = jest.fn((obj: number) => { cleanedUp.push(obj); });
    const factory = jest.fn(() => ++instanceCounter);

    const { rerender } = renderHook(
      ({ deps }) => useManagedInstance({ factory, cleanup }, deps),
      { initialProps: { deps: ['a'] } }
    );

    rerender({ deps: ['b'] });

    expect(cleanedUp).toContain(1);
  });

  it('does not recreate when dependencies are same ref', () => {
    const { useManagedInstance } = require('../core/hooks/useManagedInstance');
    const cleanup = jest.fn();
    const factory = jest.fn(() => ++instanceCounter);
    const deps = ['stable'];

    const { result, rerender } = renderHook(
      () => useManagedInstance({ factory, cleanup }, deps),
    );

    const firstResult = result.current;

    rerender();

    expect(result.current).toBe(firstResult);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('uses custom dependenciesEqualFn', () => {
    const { useManagedInstance } = require('../core/hooks/useManagedInstance');
    const cleanup = jest.fn((obj: number) => { cleanedUp.push(obj); });
    const factory = jest.fn(() => ++instanceCounter);
    const dependenciesEqualFn = jest.fn((a: string, b?: string) => a.toLowerCase() === b?.toLowerCase());

    const { result, rerender } = renderHook(
      ({ deps }) => useManagedInstance({ factory, cleanup, dependenciesEqualFn }, deps),
      { initialProps: { deps: ['Hello'] } }
    );

    expect(result.current).toBe(1);

    rerender({ deps: ['hello'] });

    expect(result.current).toBe(1);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('factory called only once on initial render', () => {
    const { useManagedInstance } = require('../core/hooks/useManagedInstance');
    const factory = jest.fn(() => ++instanceCounter);
    const cleanup = jest.fn();

    renderHook(() => useManagedInstance({ factory, cleanup }, ['dep']));

    expect(factory).toHaveBeenCalledTimes(1);
  });
});
