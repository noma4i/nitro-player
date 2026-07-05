#import "KTVHCRequestLedger.h"
#import <os/lock.h>

static NSUInteger const KTVHCRequestLedgerLimit = 200;

@interface KTVHCRequestLedger ()

@property (nonatomic) os_unfair_lock lock;
@property (nonatomic) NSUInteger nextRequestId;
@property (nonatomic, strong) NSMutableArray<NSMutableDictionary *> *entries;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *openNetworkRequestCounts;

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
        _openNetworkRequestCounts = [NSMutableDictionary dictionary];
    }
    return self;
}

- (NSNumber *)beginRequestWithURL:(NSURL *)URL
{
    return [self beginRequestWithURL:URL client:nil];
}

- (NSNumber *)beginRequestWithURL:(NSURL *)URL client:(NSString *)client
{
    return [self beginRequestWithURL:URL client:client clientPort:nil userAgent:nil];
}

- (NSNumber *)beginRequestWithURL:(NSURL *)URL client:(NSString *)client clientPort:(NSNumber *)clientPort userAgent:(NSString *)userAgent
{
    NSNumber *requestId = nil;
    NSString *normalizedClient = [self normalizedClient:client];
    NSString *userAgentTail = [self userAgentTail:userAgent];
    os_unfair_lock_lock(&_lock);
    requestId = @(_nextRequestId++);
    NSMutableDictionary *entry = [@{
        @"requestId": requestId,
        @"url": URL.absoluteString ?: @"",
        @"urlTail": [self urlTailForURL:URL],
        @"client": normalizedClient,
        @"clientPort": clientPort ?: [NSNull null],
        @"userAgent": userAgentTail ?: [NSNull null],
        @"isPlaylist": @([self isPlaylistURL:URL]),
        @"streamKey": [self streamKeyForURL:URL],
        @"countedOpenNetwork": @(NO),
        @"tStartMs": @([self nowMs]),
        @"bytes": @(0),
        @"usedNetwork": @(NO)
    } mutableCopy];
    [_entries addObject:entry];
    if (_entries.count > KTVHCRequestLedgerLimit) {
        NSRange trimRange = NSMakeRange(0, _entries.count - KTVHCRequestLedgerLimit);
        for (NSMutableDictionary *trimmedEntry in [_entries subarrayWithRange:trimRange]) {
            [self decrementOpenNetworkCountForEntryLocked:trimmedEntry];
        }
        [_entries removeObjectsInRange:trimRange];
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
        [self decrementOpenNetworkCountForEntryLocked:entry];
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
        [self incrementOpenNetworkCountForEntryLocked:entry];
    }
    os_unfair_lock_unlock(&_lock);
}

- (NSUInteger)openNetworkRequestCountForClient:(NSString *)client streamKey:(NSString *)streamKey
{
    NSString *normalizedClient = [self normalizedClient:client];
    NSString *normalizedStreamKey = streamKey ?: @"";
    if (normalizedStreamKey.length == 0) {
        return 0;
    }

    NSString *counterKey = [self counterKeyForClient:normalizedClient streamKey:normalizedStreamKey];
    os_unfair_lock_lock(&_lock);
    NSUInteger count = [_openNetworkRequestCounts[counterKey] unsignedIntegerValue];
    os_unfair_lock_unlock(&_lock);
    return count;
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
        [copy removeObjectForKey:@"countedOpenNetwork"];
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

- (void)incrementOpenNetworkCountForEntryLocked:(NSMutableDictionary *)entry
{
    if ([entry[@"countedOpenNetwork"] boolValue]) {
        return;
    }
    if (entry[@"tDoneMs"]) {
        return;
    }
    NSString *streamKey = [self stringValue:entry[@"streamKey"]];
    if (streamKey.length == 0) {
        return;
    }

    NSString *client = [self normalizedClient:[self stringValue:entry[@"client"]]];
    NSString *counterKey = [self counterKeyForClient:client streamKey:streamKey];
    NSUInteger count = [_openNetworkRequestCounts[counterKey] unsignedIntegerValue];
    _openNetworkRequestCounts[counterKey] = @(count + 1);
    entry[@"countedOpenNetwork"] = @(YES);
}

- (void)decrementOpenNetworkCountForEntryLocked:(NSMutableDictionary *)entry
{
    if (![entry[@"countedOpenNetwork"] boolValue]) {
        return;
    }
    NSString *streamKey = [self stringValue:entry[@"streamKey"]];
    if (streamKey.length == 0) {
        entry[@"countedOpenNetwork"] = @(NO);
        return;
    }

    NSString *client = [self normalizedClient:[self stringValue:entry[@"client"]]];
    NSString *counterKey = [self counterKeyForClient:client streamKey:streamKey];
    NSUInteger count = [_openNetworkRequestCounts[counterKey] unsignedIntegerValue];
    if (count <= 1) {
        [_openNetworkRequestCounts removeObjectForKey:counterKey];
    } else {
        _openNetworkRequestCounts[counterKey] = @(count - 1);
    }
    entry[@"countedOpenNetwork"] = @(NO);
}

- (NSString *)counterKeyForClient:(NSString *)client streamKey:(NSString *)streamKey
{
    return [NSString stringWithFormat:@"%@\n%@", [self normalizedClient:client], streamKey ?: @""];
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

- (NSString *)streamKeyForURL:(NSURL *)URL
{
    NSString *fileName = URL.lastPathComponent;
    if (fileName.length == 0) {
        NSArray<NSString *> *components = [URL.pathComponents filteredArrayUsingPredicate:[NSPredicate predicateWithBlock:^BOOL(NSString *component, NSDictionary *bindings) {
            return component.length > 0 && ![component isEqualToString:@"/"];
        }]];
        fileName = components.lastObject ?: URL.host ?: URL.absoluteString ?: @"";
    }

    NSRange hlsRange = [fileName rangeOfString:@"-hls" options:NSCaseInsensitiveSearch];
    if (hlsRange.location == NSNotFound) {
        return fileName;
    }
    return [fileName substringToIndex:hlsRange.location];
}

- (NSString *)normalizedClient:(NSString *)client
{
    if ([client isEqualToString:@"preview"] || [client isEqualToString:@"prefetch"]) {
        return client;
    }
    return @"player";
}

- (NSString *)stringValue:(id)value
{
    return [value isKindOfClass:[NSString class]] ? value : @"";
}

- (NSString *)userAgentTail:(NSString *)userAgent
{
    if (userAgent.length <= 40) {
        return userAgent.length > 0 ? userAgent : nil;
    }
    return [userAgent substringFromIndex:userAgent.length - 40];
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
