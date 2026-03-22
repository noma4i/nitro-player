#import "RCTNitroPlayerComponentView.h"

#import "NitroPlay-Swift-Cxx-Umbrella.hpp"

#if __has_include("NitroPlay/NitroPlay-Swift.h")
#import "NitroPlay/NitroPlay-Swift.h"
#else
#import "NitroPlay-Swift.h"
#endif

@implementation RCTNitroPlayerComponentView {
  NitroPlayerComponentView *_view;
}

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    // Initialize NitroPlayerComponentView with the given frame
    _view = [[NitroPlayerComponentView alloc] initWithFrame:frame];
    _view.translatesAutoresizingMaskIntoConstraints = NO;
    [self addSubview:_view];

    // Set up constraints to make NitroPlayerComponentView fill
    // RCTNitroPlayerComponentView
    [NSLayoutConstraint activateConstraints:@[
      [_view.leadingAnchor constraintEqualToAnchor:self.leadingAnchor],
      [_view.trailingAnchor constraintEqualToAnchor:self.trailingAnchor],
      [_view.topAnchor constraintEqualToAnchor:self.topAnchor],
      [_view.bottomAnchor constraintEqualToAnchor:self.bottomAnchor]
    ]];
  }
  return self;
}

- (void)setNitroId:(NSNumber *)nitroId {
  _nitroId = nitroId;
  [_view setNitroId:nitroId];

  // Emit the onNitroIdChange event when nitroId is updated
  if (self.onNitroIdChange) {
    self.onNitroIdChange(@{@"nitroId" : nitroId});
  }
}

@end
