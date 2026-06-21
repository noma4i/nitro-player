# NitroPlay vendored KTVHTTPCache

Vendored from `ChangbaDevs/KTVHTTPCache` at commit `388da9af7891ea081e2631e09483ff5cbb09639b`.

This code is private NitroPlay implementation detail for the iOS HLS/cache proxy. Do not expose KTV APIs as NitroPlay public API.

## Included upstream code

| Source | License | Notes |
| --- | --- | --- |
| `KTVHTTPCache/` | MIT | Original media HTTP cache framework |
| `Vendors/CocoaAsyncSocket/` | Public domain notice in source header | Required by KTV's embedded CocoaHTTPServer |

## Local fixes ported

| Upstream reference | Local behavior |
| --- | --- |
| PR #200 | HTTP `400` responses are rejected and not cached |
| PR #169 | Additional headers can be scoped per original URL |
| PR #187 | WebSocket upgrade comparison uses explicit `!= NSOrderedSame` |
| PR #184 | `KTVHCNotFound` uses `LLONG_MAX` |
| PR #188 | Multipart pending-byte method uses `NSUInteger` consistently |
| PR #148 | Download core lock is initialized eagerly in `init` |
| PR #93 | `NSError **` output is written only when non-null |
| Issue #94 | Proxied response headers strip `Content-Encoding` after `NSURLSession` decoding |

PR #21 is not copied directly because the proposed CoreFoundation ownership change is unsafe under ARC without a dedicated leak reproduction.
