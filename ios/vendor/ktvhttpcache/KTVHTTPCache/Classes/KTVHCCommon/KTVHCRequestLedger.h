#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface KTVHCRequestLedger : NSObject

+ (instancetype)sharedLedger;

- (NSNumber *)beginRequestWithURL:(NSURL *)URL;
- (NSNumber *)beginRequestWithURL:(NSURL *)URL client:(nullable NSString *)client;
- (NSNumber *)beginRequestWithURL:(NSURL *)URL client:(nullable NSString *)client clientPort:(nullable NSNumber *)clientPort userAgent:(nullable NSString *)userAgent;
- (void)markFirstByteForRequestId:(NSNumber *)requestId;
- (void)addBytes:(NSUInteger)bytes forRequestId:(NSNumber *)requestId;
- (void)markDoneForRequestId:(NSNumber *)requestId;
- (void)markUsedNetworkForRequestId:(NSNumber *)requestId;
- (NSUInteger)openNetworkRequestCountForClient:(NSString *)client streamKey:(NSString *)streamKey;
- (NSArray<NSDictionary *> *)snapshot;

@end

NS_ASSUME_NONNULL_END
