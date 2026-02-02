describe('NativeVideoView lookup', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('checks for RNCVideoView runtime name', () => {
    const hasViewManagerConfig = jest.fn(() => true);

    jest.doMock('react-native', () => ({
      Platform: {
        select: jest.fn(() => ''),
      },
      UIManager: {
        hasViewManagerConfig,
      },
    }));

    jest.doMock('../spec/fabric/VideoViewNativeComponent', () => 'NativeComponent');

    require('../core/video-view/NativeVideoView');

    expect(hasViewManagerConfig).toHaveBeenCalledWith('RNCVideoView');
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

    jest.doMock('../spec/fabric/VideoViewNativeComponent', () => 'NativeComponent');

    const { NativeVideoView } = require('../core/video-view/NativeVideoView');

    expect(() => NativeVideoView()).toThrow(/doesn't seem to be linked/i);
  });
});
