#import <React/RCTView.h>

@interface RCTNitroPlayerComponentView : RCTView

@property (nonatomic, copy) NSNumber *nitroId;
@property (nonatomic, copy) RCTDirectEventBlock onNitroIdChange;

@end

