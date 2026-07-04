//
//  KTVHCHTTPConnection.m
//  KTVHTTPCache
//
//  Created by Single on 2017/8/10.
//  Copyright © 2017年 Single. All rights reserved.
//

#import "KTVHCHTTPConnection.h"
#import "KTVHCHTTPHLSResponse.h"
#import "KTVHCHTTPResponse.h"
#import "KTVHCDataStorage.h"
#import "KTVHCHTTPHeader.h"
#import "KTVHCRequestLedger.h"
#import "KTVHCURLTool.h"
#import "KTVHCLog.h"
#import "../../Vendors/CocoaAsyncSocket/GCDAsyncSocket.h"

static NSString * const KTVHCRequestClientHeaderName = @"X-Nitro-Play-Client";
static NSString * const KTVHCRequestClientHeaderNameLowercase = @"x-nitro-play-client";

@implementation KTVHCHTTPConnection

+ (NSString *)URITokenPing
{
    return @"KTVHTTPCachePing";
}

+ (NSString *)URITokenPlaceHolder
{
    return @"KTVHTTPCachePlaceHolder";
}

+ (NSString *)URITokenLastPathComponent
{
    return @"KTVHTTPCacheLastPathComponent";
}

- (id)initWithAsyncSocket:(GCDAsyncSocket *)newSocket configuration:(HTTPConfig *)aConfig
{
    if (self = [super initWithAsyncSocket:newSocket configuration:aConfig]) {
        KTVHCLogAlloc(self);
    }
    return self;
}

- (void)dealloc
{
    KTVHCLogDealloc(self);
}

- (NSObject<HTTPResponse> *)httpResponseForMethod:(NSString *)method URI:(NSString *)path
{
    KTVHCLogHTTPConnection(@"%p, Receive request\nmethod : %@\npath : %@\nURL : %@", self, method, path, request.url);
    if ([path containsString:[self.class URITokenPing]]) {
        return [[HTTPDataResponse alloc] initWithData:[@"ping" dataUsingEncoding:NSUTF8StringEncoding]];
    }
    NSMutableArray *components = [path componentsSeparatedByString:@"/"].mutableCopy;
    if (components.count < 3) {
        return [[HTTPErrorResponse alloc] initWithErrorCode:404];
    }
    NSString *URLString = [[KTVHCURLTool tool] URLDecode:components[1]];
    if (![URLString hasPrefix:@"http"]) {
        return [[HTTPErrorResponse alloc] initWithErrorCode:404];
    }
    NSURL *URL = nil;
    if ([path containsString:[self.class URITokenLastPathComponent]]) {
        URL = [NSURL URLWithString:URLString];
    } else {
        [components removeObjectAtIndex:0];
        [components removeObjectAtIndex:0];
        NSURL *baseURL = [NSURL URLWithString:URLString].URLByDeletingLastPathComponent;
        if ([path containsString:[self.class URITokenPlaceHolder]]) {
            [components removeObjectAtIndex:0];
        } else {
            baseURL = baseURL.URLByDeletingLastPathComponent;
        }
        NSString *lastPathComponent = [components componentsJoinedByString:@"/"];
        if ([lastPathComponent hasPrefix:@"http"]) {
            URL = [NSURL URLWithString:lastPathComponent];
        } else {
            URL = [baseURL URLByAppendingPathComponent:lastPathComponent];
        }
        KTVHCLogHTTPConnection(@"%p, Receive redirect request\nURL : %@", self, URL);
    }
    KTVHCLogHTTPConnection(@"%p, Accept request\nURL : %@", self, URL);
    NSMutableDictionary *requestHeaders = [request.allHeaderFields mutableCopy] ?: [NSMutableDictionary dictionary];
    NSString *client = requestHeaders[KTVHCRequestClientHeaderName] ?: requestHeaders[KTVHCRequestClientHeaderNameLowercase];
    NSString *userAgent = [self userAgentFromHeaders:requestHeaders];
    NSNumber *clientPort = [self clientPort];
    [requestHeaders removeObjectForKey:KTVHCRequestClientHeaderName];
    [requestHeaders removeObjectForKey:KTVHCRequestClientHeaderNameLowercase];
    KTVHCDataRequest *dataRequest = [[KTVHCDataRequest alloc] initWithURL:URL headers:requestHeaders];
    NSNumber *ledgerRequestId = [[KTVHCRequestLedger sharedLedger] beginRequestWithURL:URL client:client clientPort:clientPort userAgent:userAgent];
    if ([URL.absoluteString containsString:@".m3u"]) {
        return [[KTVHCHTTPHLSResponse alloc] initWithConnection:self dataRequest:dataRequest ledgerRequestId:ledgerRequestId];
    }
    return [[KTVHCHTTPResponse alloc] initWithConnection:self dataRequest:dataRequest ledgerRequestId:ledgerRequestId];
}

- (NSNumber *)clientPort
{
    uint16_t port = [asyncSocket connectedPort];
    return port > 0 ? @(port) : nil;
}

- (NSString *)userAgentFromHeaders:(NSDictionary *)headers
{
    for (NSString *key in headers) {
        if ([key caseInsensitiveCompare:@"User-Agent"] == NSOrderedSame) {
            id value = headers[key];
            return [value isKindOfClass:[NSString class]] ? value : nil;
        }
    }
    return nil;
}

@end
