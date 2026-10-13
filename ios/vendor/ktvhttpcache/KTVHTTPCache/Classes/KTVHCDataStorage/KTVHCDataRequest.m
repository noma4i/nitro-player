//
//  KTVHCDataRequest.m
//  KTVHTTPCache
//
//  Created by Single on 2017/8/11.
//  Copyright © 2017年 Single. All rights reserved.
//

#import "KTVHCDataRequest.h"
#import "KTVHCData+Internal.h"
#import "KTVHCLog.h"

NSString * const KTVHCCacheNamespaceHeader = @"X-KTVHC-Cache-Namespace";
NSString * const KTVHCForwardedHeaderNamesHeader = @"X-KTVHC-Forwarded-Header-Names";

static NSString * const KTVHCCacheNamespaceFragmentPrefix = @"__ktvhc_cache_namespace=";

@interface KTVHCDataRequest ()

- (instancetype)initWithURL:(NSURL *)URL
                     headers:(NSDictionary *)headers
              cacheNamespace:(NSString *)cacheNamespace
    forwardedHeaderNames:(NSSet<NSString *> *)forwardedHeaderNames;

@end

@implementation KTVHCDataRequest

- (instancetype)initWithURL:(NSURL *)URL headers:(NSDictionary *)headers
{
    NSMutableDictionary *sanitizedHeaders = [NSMutableDictionary dictionary];
    __block NSString *cacheNamespace = nil;
    NSMutableSet<NSString *> *forwardedHeaderNames = [NSMutableSet set];
    [headers enumerateKeysAndObjectsUsingBlock:^(NSString *key, NSString *value, BOOL *stop) {
        if ([key caseInsensitiveCompare:KTVHCCacheNamespaceHeader] == NSOrderedSame) {
            cacheNamespace = value;
            return;
        }
        if ([key caseInsensitiveCompare:KTVHCForwardedHeaderNamesHeader] == NSOrderedSame) {
            for (NSString *headerName in [value componentsSeparatedByString:@","]) {
                NSString *normalizedHeaderName = [[headerName stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]] lowercaseString];
                if (normalizedHeaderName.length > 0) {
                    [forwardedHeaderNames addObject:normalizedHeaderName];
                }
            }
            return;
        }
        [sanitizedHeaders setObject:value forKey:key];
    }];
    return [self initWithURL:URL
                     headers:sanitizedHeaders
              cacheNamespace:cacheNamespace
    forwardedHeaderNames:forwardedHeaderNames];
}

- (instancetype)initWithURL:(NSURL *)URL
                     headers:(NSDictionary *)headers
              cacheNamespace:(NSString *)cacheNamespace
    forwardedHeaderNames:(NSSet<NSString *> *)forwardedHeaderNames
{
    if (self = [super init]) {
        KTVHCLogAlloc(self);
        self->_URL = URL;
        self->_headers = KTVHCRangeFillToRequestHeadersIfNeeded(KTVHCRangeFull(), headers);
        self->_cacheNamespace = [cacheNamespace copy] ?: @"";
        self->_forwardedHeaderNames = [forwardedHeaderNames copy] ?: [NSSet set];
        self->_cacheURL = [[self class] cacheURLWithOriginalURL:URL namespace:self.cacheNamespace];
        self->_range = KTVHCRangeWithRequestHeaderValue([self.headers objectForKey:@"Range"]);
        KTVHCLogDataRequest(@"%p Create data request\nURL : %@\nCache URL : %@\nHeaders : %@\nRange : %@", self, self.URL, self.cacheURL, self.headers, KTVHCStringFromRange(self.range));
    }
    return self;
}

+ (NSURL *)cacheURLWithOriginalURL:(NSURL *)URL namespace:(NSString *)cacheNamespace
{
    if (!cacheNamespace.length) {
        return URL;
    }
    NSURLComponents *components = [NSURLComponents componentsWithURL:URL resolvingAgainstBaseURL:NO];
    if (!components) {
        return URL;
    }
    NSString *marker = [KTVHCCacheNamespaceFragmentPrefix stringByAppendingString:cacheNamespace];
    components.fragment = components.fragment.length > 0
        ? [components.fragment stringByAppendingFormat:@"&%@", marker]
        : marker;
    return components.URL ?: URL;
}

+ (BOOL)cacheURL:(NSURL *)URL belongsToNamespace:(NSString *)cacheNamespace
{
    if (!cacheNamespace.length) {
        return NO;
    }
    NSString *expectedMarker = [KTVHCCacheNamespaceFragmentPrefix stringByAppendingString:cacheNamespace];
    for (NSString *component in [URL.fragment componentsSeparatedByString:@"&"]) {
        if ([component isEqualToString:expectedMarker]) {
            return YES;
        }
    }
    return NO;
}

- (void)dealloc
{
    KTVHCLogDealloc(self);
}

- (KTVHCDataRequest *)newRequestWithRange:(KTVHCRange)range
{
    NSDictionary *headers = KTVHCRangeFillToRequestHeaders(range, self.headers);
    KTVHCDataRequest *obj = [[KTVHCDataRequest alloc] initWithURL:self.URL
                                                           headers:headers
                                                    cacheNamespace:self.cacheNamespace
                                          forwardedHeaderNames:self.forwardedHeaderNames];
    return obj;
}

- (KTVHCDataRequest *)newRequestWithTotalLength:(long long)totalLength
{
    KTVHCRange range = KTVHCRangeWithEnsureLength(self.range, totalLength);
    return [self newRequestWithRange:range];
}

- (KTVHCDataRequest *)newRequestWithURL:(NSURL *)URL
{
    return [[KTVHCDataRequest alloc] initWithURL:URL
                                         headers:self.headers
                                  cacheNamespace:self.cacheNamespace
                        forwardedHeaderNames:self.forwardedHeaderNames];
}

@end
