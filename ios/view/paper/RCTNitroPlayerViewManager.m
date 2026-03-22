#import <React/RCTViewManager.h>
#import "RCTEventDispatcher.h"
#import "RCTNitroPlayerComponentView.h"

@interface RCTNitroPlayerViewManager : RCTViewManager
@end

@implementation RCTNitroPlayerViewManager

RCT_EXPORT_MODULE(RNCNitroPlayerView)
RCT_EXPORT_VIEW_PROPERTY(nitroId, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(onNitroIdChange, RCTDirectEventBlock)

- (UIView *)view {
  return [[RCTNitroPlayerComponentView alloc] init];
}

@end
