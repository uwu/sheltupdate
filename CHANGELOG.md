## r37
 - make tracing service name configurable

## r36
 - switch from logging to tracing

## r35
 - Only cache successful responses

## r34
 - Fix yt_ad_block and disable yt_embed_fix (for now)

## r33
 - Fix missing import in prod
 - Improve host version reporting

## r32
 - Add cache (in)validation to help prevent breakages (issue #6)
 - Reduce the amount of unnecessary detritus left in the v2 cache

## r31
 - Add Moonlight
 - Remove Kernel
 - Allow selecting incompatible branches in the client mods tab
 - Add support for async branch main scripts

## r30
Fix mainScreen.getMainWindowId() returning null

## r29
 - Fix "MissingContentLength" error when being hosted behind Cloudflare proxy
 - Correctly indent branch code in index.js and preload.js
 - Catch errors thrown by branches

## r28
Disallow incompatible branch combinations in the client mods tab

## r27
Improve dashboard load time

## r26
 - Add branch selector UI compatibility for self hosted instances
 - Bundle info about sheltupdate branches into desktop_core
 - Fix first launch failing when an update has occured

## r25
Add tweak for replacing Discord's titlebar with Windows' native one (TY @koffydrop)

## r24
 - Fix branches with subdirs (Vencord)
 - Fix solid error in client mods settings page
 - Remove goose_modules

## r23
Fix charts sorting in dashboard

## r22
 - Fix branchesLoader manifest not including subdirs (TY @marshift)
 - Block @sentry/electron requests

## r21
 - Order charts by value instead of key
 - Improve responsiveness in dashboard

## r20
 - Fix chart order in dashboard
 - Also show links on small devices

## r19
 - Fix stats in dashboard
 - Link changelog and branches in dashboard

## r18
Improve shelter bundle fetching

## r17
 - Make the new dashboard look nicer
 - Replace useless last module time with cache hit rates
 - Read the version number out of the changelog

## r16
 - Overhaul stats reporting code
 - Completely replace stats dashboard

## r15
Make the Selector UI get branches from the API

## r14
 - Decrease size of Docker image
 - Fix V1 patcher not cleaning up after itself, throwing and requiring a retry to actually serve
 - Fix V1 patcher not waiting for unzip, causing it to serve broken modules
 - Move V1 patcher scratch folder into the cache

## r13
Add Tweak branches to the Selector UI

## r12
 - Fix some path portability issues
 - Add Spotify Embed Volume
 - Add YT Ad Block
 - Add YT Embed Fix

## r11
 - Significantly nicer logging
 - Way faster full.distro generation for API V2 (~45s -> ~2s)
 - Make stats toggleable
 - Switch to JS setups from bash ones
 - Add branch metadata API

## r10
Fix the shelter devtools patch crashing BD's injection
## r9
Fix tars being broken on windows
## r8
ditto.
## r7
Cap the version numbers so that the API V2 client doesn't break
## r6
Fix some branches not being generated
## r5
Fix an infinite loop on Windows making the client unusable
## r4
Add branch selector UI to shelter

## r3
 - Fix broken X-Forwarded-For
 - Fix typo in ReusableResponse
 - Fix shelter injection CSP removal

## r2
 - Attempt to fix response body reuse bug
 - Fix broken stats

## r1
 - Hello, World!
 - Refactor entire GooseUpdate codebase
 - Update server technology
 - Add shelter branch and remove irrelevant branches
