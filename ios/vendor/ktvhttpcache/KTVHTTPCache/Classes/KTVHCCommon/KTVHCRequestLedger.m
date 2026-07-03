#import "KTVHCRequestLedger.h"
#import <os/lock.h>

static NSUInteger const KTVHCRequestLedgerLimit = 200;

@interface KTVHCRequestLedger ()

@property (nonatomic) os_unfair_lock lock;
@property (nonatomic) NSUInteger nextRequestId;
@property (nonatomic, strong) NSMutableArray<NSMutableDictionary *> *entries;

@end

@implementation KTVHCRequestLedger

+ (instancetype)sharedLedger
{
    static KTVHCRequestLedger *ledger = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        ledger = [[KTVHCRequestLedger alloc] init];
    });
    return ledger;
}

- (instancetype)init
{
    if (self = [super init]) {
        _lock = OS_UNFAIR_LOCK_INIT;
        _nextRequestId = 1;
        _entries = [NSMutableArray array];
    }
    return self;
}

- (NSNumber *)beginRequestWithURL:(NSURL *)URL
{
    NSNumber *requestId = nil;
    os_unfair_lock_lock(&_lock);
    requestId = @(_nextRequestId++);
    NSMutableDictionary *entry = [@{
        @"requestId": requestId,
        @"url": URL.absoluteString ?: @"",
        @"urlTail": [self urlTailForURL:URL],
        @"isPlaylist": @([self isPlaylistURL:URL]),
        @"tStartMs": @([self nowMs]),
        @"bytes": @(0),
        @"usedNetwork": @(NO)
    } mutableCopy];
    [_entries addObject:entry];
    if (_entries.count > KTVHCRequestLedgerLimit) {
        [_entries removeObjectsInRange:NSMakeRange(0, _entries.count - KTVHCRequestLedgerLimit)];
    }
    os_unfair_lock_unlock(&_lock);
    return requestId;
}

- (void)markFirstByteForRequestId:(NSNumber *)requestId
{
    if (!requestId) {
        return;
    }
    os_unfair_lock_lock(&_lock);
    NSMutableDictionary *entry = [self entryForRequestIdLocked:requestId];
    if (entry && !entry[@"tFirstByteMs"]) {
        entry[@"tFirstByteMs"] = @([self nowMs]);
    }
    os_unfair_lock_unlock(&_lock);
}

- (void)addBytes:(NSUInteger)bytes forRequestId:(NSNumber *)requestId
{
    if (!requestId || bytes == 0) {
        return;
    }
    os_unfair_lock_lock(&_lock);
    NSMutableDictionary *entry = [self entryForRequestIdLocked:requestId];
    if (entry) {
        unsigned long long currentBytes = [entry[@"bytes"] unsignedLongLongValue];
        entry[@"bytes"] = @(currentBytes + bytes);
    }
    os_unfair_lock_unlock(&_lock);
}

- (void)markDoneForRequestId:(NSNumber *)requestId
{
    if (!requestId) {
        return;
    }
    os_unfair_lock_lock(&_lock);
    NSMutableDictionary *entry = [self entryForRequestIdLocked:requestId];
    if (entry && !entry[@"tDoneMs"]) {
        entry[@"tDoneMs"] = @([self nowMs]);
    }
    os_unfair_lock_unlock(&_lock);
}

- (void)markUsedNetworkForRequestId:(NSNumber *)requestId
{
    if (!requestId) {
        return;
    }
    os_unfair_lock_lock(&_lock);
    NSMutableDictionary *entry = [self entryForRequestIdLocked:requestId];
    if (entry) {
        entry[@"usedNetwork"] = @(YES);
    }
    os_unfair_lock_unlock(&_lock);
}

- (NSArray<NSDictionary *> *)snapshot
{
    os_unfair_lock_lock(&_lock);
    NSMutableArray<NSDictionary *> *snapshot = [NSMutableArray arrayWithCapacity:_entries.count];
    for (NSDictionary *entry in _entries) {
        NSMutableDictionary *copy = [entry mutableCopy];
        if (!copy[@"tFirstByteMs"]) {
            copy[@"tFirstByteMs"] = [NSNull null];
        }
        if (!copy[@"tDoneMs"]) {
            copy[@"tDoneMs"] = [NSNull null];
        }
        [copy removeObjectForKey:@"url"];
        [copy removeObjectForKey:@"requestId"];
        [snapshot addObject:copy];
    }
    os_unfair_lock_unlock(&_lock);
    return snapshot;
}

- (NSMutableDictionary *)entryForRequestIdLocked:(NSNumber *)requestId
{
    for (NSMutableDictionary *entry in [_entries reverseObjectEnumerator]) {
        if ([entry[@"requestId"] isEqualToNumber:requestId]) {
            return entry;
        }
    }
    return nil;
}

- (NSString *)urlTailForURL:(NSURL *)URL
{
    NSArray<NSString *> *components = [URL.pathComponents filteredArrayUsingPredicate:[NSPredicate predicateWithBlock:^BOOL(NSString *component, NSDictionary *bindings) {
        return component.length > 0 && ![component isEqualToString:@"/"];
    }]];
    if (components.count == 0) {
        return URL.host ?: URL.absoluteString ?: @"";
    }
    NSUInteger start = components.count > 2 ? components.count - 2 : 0;
    NSArray<NSString *> *tail = [components subarrayWithRange:NSMakeRange(start, components.count - start)];
    return [tail componentsJoinedByString:@"/"];
}

- (BOOL)isPlaylistURL:(NSURL *)URL
{
    NSString *path = URL.path.lowercaseString;
    return [path containsString:@".m3u8"] || [path containsString:@".m3u"];
}

- (double)nowMs
{
    return [[NSDate date] timeIntervalSince1970] * 1000.0;
}

@end
