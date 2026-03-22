#import <React/RCTViewManager.h>
#import <React/RCTUIManager.h>
#import "RCTBridge.h"

@interface RCTNitroPlayerViewManager : RCTViewManager
@end

@implementation RCTNitroPlayerViewManager

RCT_EXPORT_MODULE(RNCNitroPlayerView)

RCT_EXPORT_VIEW_PROPERTY(nitroId, NSNumber)

@end
