#import "RCTNitroPlayerComponentView.h"

#import <react/renderer/components/RNCNitroPlayerViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNCNitroPlayerViewSpec/EventEmitters.h>
#import <react/renderer/components/RNCNitroPlayerViewSpec/Props.h>
#import <react/renderer/components/RNCNitroPlayerViewSpec/RCTComponentViewHelpers.h>

#import "RCTFabricComponentsPlugins.h"

#import "NitroPlay-Swift-Cxx-Umbrella.hpp"

#if __has_include("NitroPlay/NitroPlay-Swift.h")
#import "NitroPlay/NitroPlay-Swift.h"
#else
#import "NitroPlay-Swift.h"
#endif

using namespace facebook::react;

@interface RCTNitroPlayerComponentView () <RCTRNCNitroPlayerViewViewProtocol>
@end

@implementation RCTNitroPlayerComponentView {
  NitroPlayerComponentView *_view;
  int _nitroId;
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps =
        std::make_shared<const RNCNitroPlayerViewProps>();
    _props = defaultProps;

    _view = [[NitroPlayerComponentView alloc] initWithFrame:frame];

    self.contentView = _view;
  }

  // -1 means that nitroId wasn't set yet
  _nitroId = -1;

  return self;
}

- (void)updateProps:(Props::Shared const &)props
           oldProps:(Props::Shared const &)oldProps {
  const auto &oldViewProps =
      *std::static_pointer_cast<RNCNitroPlayerViewProps const>(_props);
  const auto &newViewProps =
      *std::static_pointer_cast<RNCNitroPlayerViewProps const>(props);

  if (oldViewProps.nitroId != newViewProps.nitroId) {
    [self setNitroId:newViewProps.nitroId];
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)setNitroId:(int)nitroId {
  _nitroId = nitroId;
  [_view setNitroId:[NSNumber numberWithInt:nitroId]];
  [self onNitroIdChange:nitroId];
}

+ (BOOL)shouldBeRecycled
{
  return NO;
}

// Event emitter convenience method
- (void)onNitroIdChange:(int)nitroId {
  auto eventEmitter =
      std::dynamic_pointer_cast<const RNCNitroPlayerViewEventEmitter>(_eventEmitter);
  if (!eventEmitter || nitroId == -1) {
    return;
  }

  eventEmitter->onNitroIdChange({.nitroId = nitroId});
}

- (void)updateEventEmitter:(EventEmitter::Shared const &)eventEmitter {
  [super updateEventEmitter:eventEmitter];
  [self onNitroIdChange:_nitroId];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<RNCNitroPlayerViewComponentDescriptor>();
}

Class<RCTComponentViewProtocol> RNCNitroPlayerViewCls(void) {
  return RCTNitroPlayerComponentView.class;
}

@end
