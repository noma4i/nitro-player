import { useEffect, useMemo, useRef, type DependencyList } from 'react';

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
export const useManagedInstance = <T, D extends DependencyList[number]>(
  config: {
    factory: () => T;
    cleanup: (object: T) => void;
    dependenciesEqualFn?: (a: D, b?: D) => boolean;
  },
  dependencies: D[]
): T => {
  const { factory, cleanup, dependenciesEqualFn } = config;

  const objectRef = useRef<T | null>(null);
  const previousDependencies = useRef(dependencies);

  if (objectRef.current == null) {
    objectRef.current = factory();
  }

  const object = useMemo(() => {
    let newObject = objectRef.current;

    const dependenciesEqual =
      previousDependencies.current?.length === dependencies.length &&
      dependencies.every((value, index) => dependenciesEqualFn?.(value, previousDependencies.current[index]) ?? value === previousDependencies.current[index]);

    if (!newObject || !dependenciesEqual) {
      // Destroy the old object
      if (objectRef.current) {
        cleanup(objectRef.current);
        objectRef.current = null;
      }

      // Create a new object
      newObject = factory();
      objectRef.current = newObject;

      // Update the previous dependencies
      previousDependencies.current = dependencies;
    }

    return newObject;

    // factory and cleanup are stable, so we don't need to re-evaluate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  useEffect(() => {
    return () => {
      if (objectRef.current) {
        cleanup(objectRef.current);
        objectRef.current = null;
      }
    };

    // factory and cleanup are stable, so we don't need to re-evaluate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return object;
};
