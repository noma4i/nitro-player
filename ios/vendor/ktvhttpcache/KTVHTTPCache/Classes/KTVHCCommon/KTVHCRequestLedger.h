#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface KTVHCRequestLedger : NSObject

+ (instancetype)sharedLedger;

- (NSNumber *)beginRequestWithURL:(NSURL *)URL;
- (void)markFirstByteForRequestId:(NSNumber *)requestId;
- (void)addBytes:(NSUInteger)bytes forRequestId:(NSNumber *)requestId;
- (void)markDoneForRequestId:(NSNumber *)requestId;
- (void)markUsedNetworkForRequestId:(NSNumber *)requestId;
- (NSArray<NSDictionary *> *)snapshot;

@end

NS_ASSUME_NONNULL_END
