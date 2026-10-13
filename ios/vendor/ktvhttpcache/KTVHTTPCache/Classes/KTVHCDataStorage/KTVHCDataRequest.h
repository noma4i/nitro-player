//
//  KTVHCDataRequest.h
//  KTVHTTPCache
//
//  Created by Single on 2017/8/11.
//  Copyright © 2017年 Single. All rights reserved.
//

#import <Foundation/Foundation.h>
#import "KTVHCRange.h"

FOUNDATION_EXPORT NSString * const KTVHCCacheNamespaceHeader;
FOUNDATION_EXPORT NSString * const KTVHCForwardedHeaderNamesHeader;

@interface KTVHCDataRequest : NSObject

+ (instancetype)new NS_UNAVAILABLE;
- (instancetype)init NS_UNAVAILABLE;

- (instancetype)initWithURL:(NSURL *)URL headers:(NSDictionary *)headers NS_DESIGNATED_INITIALIZER;

@property (nonatomic, copy, readonly) NSURL *URL;
@property (nonatomic, copy, readonly) NSDictionary *headers;
@property (nonatomic, copy, readonly) NSURL *cacheURL;
@property (nonatomic, copy, readonly) NSString *cacheNamespace;
@property (nonatomic, copy, readonly) NSSet<NSString *> *forwardedHeaderNames;
@property (nonatomic, readonly) KTVHCRange range;

@end
