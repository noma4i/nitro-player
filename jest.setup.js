globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native', () => ({
  Image: { resolveAssetSource: () => null },
  Platform: { OS: 'ios' }
}));
