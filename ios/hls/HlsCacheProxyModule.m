#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(HlsCacheProxy, NSObject)

RCT_EXTERN_METHOD(start:(NSNumber *)port)
RCT_EXTERN_METHOD(stop)
RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(getProxiedUrl:(NSString *)url headers:(NSDictionary *)headers)
RCT_EXTERN_METHOD(prefetchFirstSegment:(NSString *)url headers:(NSDictionary *)headers resolver:(RCTPromiseResolveBlock)resolver rejecter:(RCTPromiseRejectBlock)rejecter)
RCT_EXTERN_METHOD(getCacheStats:(RCTPromiseResolveBlock)resolver rejecter:(RCTPromiseRejectBlock)rejecter)
RCT_EXTERN_METHOD(getStreamCacheStats:(NSString *)url resolver:(RCTPromiseResolveBlock)resolver rejecter:(RCTPromiseRejectBlock)rejecter)
RCT_EXTERN_METHOD(clearCache:(RCTPromiseResolveBlock)resolver rejecter:(RCTPromiseRejectBlock)rejecter)

@end
