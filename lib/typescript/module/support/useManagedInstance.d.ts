import { type DependencyList } from 'react';
/**
 * @internal
 * A hook that helps to manage the lifecycle of a native instance in a React component.
 * It allows instance to be recreated when dependencies change, but not when the component is hot reloaded.
 *
 * @param config.factory - The factory function that creates the instance.
 * @param config.cleanup - The cleanup function that destroys the instance.
 * @param config.dependenciesEqualFn - The function that compares the dependencies.
 *
 * @param dependencies - The dependencies array.
 * @returns The managed instance.
 */
export declare const useManagedInstance: <T, D extends DependencyList[number]>(config: {
    factory: () => T;
    cleanup: (object: T) => void;
    dependenciesEqualFn?: (a: D, b?: D) => boolean;
}, dependencies: D[]) => T;
//# sourceMappingURL=useManagedInstance.d.ts.map