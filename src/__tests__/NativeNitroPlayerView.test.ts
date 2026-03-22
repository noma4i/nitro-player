describe('NativeNitroPlayerView lookup', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('checks for RNCNitroPlayerView runtime name', () => {
    const hasViewManagerConfig = jest.fn(() => true);

    jest.doMock('react-native', () => ({
      Platform: {
        select: jest.fn(() => ''),
      },
      UIManager: {
        hasViewManagerConfig,
      },
    }));

    jest.doMock('../spec/fabric/NitroPlayerViewNativeComponent', () => 'NativeComponent');

    require('../core/player-view/NativeNitroPlayerView');

    expect(hasViewManagerConfig).toHaveBeenCalledWith('RNCNitroPlayerView');
  });

  it('throws the linking error when the native view manager is unavailable', () => {
    jest.doMock('react-native', () => ({
      Platform: {
        select: jest.fn(() => ''),
      },
      UIManager: {
        hasViewManagerConfig: jest.fn(() => false),
      },
    }));

    jest.doMock('../spec/fabric/NitroPlayerViewNativeComponent', () => 'NativeComponent');

    const { NativeNitroPlayerView } = require('../core/player-view/NativeNitroPlayerView');

    expect(() => NativeNitroPlayerView()).toThrow(/doesn't seem to be linked/i);
  });
});
