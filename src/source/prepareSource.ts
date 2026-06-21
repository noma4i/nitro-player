import { NitroPlayerRuntimeError } from '../support/errors/NitroPlayerError';
import { validateSourceConfig } from './sourceValidation';
import { DEFAULT_SOURCE_POLICY, isNitroSourcePolicy, SOURCE_POLICY_DEFAULTS } from './sourcePolicy';
import type {
  NativeNitroPlayerConfig,
  NitroSourceConfig,
  NitroSourceDescriptor,
  NitroSourceIdentity,
  NitroSourceInput,
  NitroSourcePolicy,
  NitroSourceUri
} from './types/NitroPlayerConfig';

const DESCRIPTOR_BRAND = '__nitroPlaySourceDescriptor';

type DescriptorBrand = {
  readonly [DESCRIPTOR_BRAND]: true;
};

export type PreparedNitroSource = NitroSourceDescriptor & DescriptorBrand;

const stableSerialize = (value: unknown): string => {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
};

const resolveUri = (uri: NitroSourceUri): string => {
  if (typeof uri === 'string') {
    if (!uri) {
      throw new NitroPlayerRuntimeError('source/invalid-uri', 'Invalid source URI');
    }
    return uri;
  }

  const { Image } = require('react-native') as typeof import('react-native');
  const resolvedSource = Image.resolveAssetSource(uri);
  if (!resolvedSource?.uri || typeof resolvedSource.uri !== 'string') {
    throw new NitroPlayerRuntimeError('source/invalid-uri', 'Invalid source URI');
  }

  return resolvedSource.uri;
};

export const isPreparedSource = (source: unknown): source is PreparedNitroSource =>
  Boolean(source && typeof source === 'object' && (source as Record<string, unknown>)[DESCRIPTOR_BRAND] === true);

const toConfig = (input: NitroSourceInput): NitroSourceConfig => {
  if (typeof input === 'string' || typeof input === 'number') {
    return { uri: input };
  }

  if (isPreparedSource(input)) {
    return input;
  }

  if (input && typeof input === 'object' && 'uri' in input) {
    return input as NitroSourceConfig;
  }

  throw new NitroPlayerRuntimeError('player/invalid-source', 'Invalid source');
};

const resolvePolicy = (config: NitroSourceConfig): NitroSourcePolicy => {
  const candidate = (config as NitroSourceConfig & { policy?: unknown }).policy;
  if (candidate === undefined) {
    return DEFAULT_SOURCE_POLICY;
  }
  if (!isNitroSourcePolicy(candidate)) {
    throw new NitroPlayerRuntimeError('player/invalid-source', `Invalid source policy: ${String(candidate)}`);
  }
  return candidate;
};

const mergeConfig = (config: NitroSourceConfig): NativeNitroPlayerConfig & { policy: NitroSourcePolicy } => {
  const policy = resolvePolicy(config);
  validateSourceConfig(config);
  const defaults = SOURCE_POLICY_DEFAULTS[policy];
  const merged: NativeNitroPlayerConfig & { policy: NitroSourcePolicy } = {
    uri: resolveUri(config.uri),
    headers: config.headers,
    metadata: config.metadata,
    startup: config.startup ?? defaults.startup,
    buffer: config.buffer ?? defaults.buffer,
    retention: {
      ...defaults.retention,
      ...config.retention
    },
    transport: {
      ...defaults.transport,
      ...config.transport
    },
    preview: {
      ...defaults.preview,
      ...config.preview
    },
    policy
  };

  if (!defaults.retention && !config.retention) {
    merged.retention = undefined;
  }
  if (!defaults.transport && !config.transport) {
    merged.transport = undefined;
  }
  if (!defaults.preview && !config.preview) {
    merged.preview = undefined;
  }

  validateSourceConfig(merged);
  return merged;
};

const buildIdentity = (config: NativeNitroPlayerConfig & { policy: NitroSourcePolicy }): NitroSourceIdentity => {
  const requestKey = stableSerialize({
    uri: config.uri,
    headers: config.headers
  });
  const previewKey = stableSerialize({
    requestKey,
    preview: config.preview
  });
  const playbackKey = stableSerialize(config);

  return { playbackKey, requestKey, previewKey };
};

export const prepareSource = (input: NitroSourceInput): PreparedNitroSource => {
  if (isPreparedSource(input)) {
    return input;
  }

  const config = mergeConfig(toConfig(input));
  const descriptor = {
    uri: config.uri,
    headers: config.headers,
    metadata: config.metadata,
    startup: config.startup,
    buffer: config.buffer,
    retention: config.retention,
    transport: config.transport,
    preview: config.preview,
    policy: config.policy,
    identity: buildIdentity(config),
    [DESCRIPTOR_BRAND]: true as const
  };

  return Object.freeze(descriptor);
};

export const toNativeSourceConfig = (source: NitroSourceInput): NativeNitroPlayerConfig => {
  const descriptor = prepareSource(source);
  return {
    uri: descriptor.uri,
    headers: descriptor.headers,
    metadata: descriptor.metadata,
    startup: descriptor.startup,
    buffer: descriptor.buffer,
    retention: descriptor.retention,
    transport: descriptor.transport,
    preview: descriptor.preview
  };
};
