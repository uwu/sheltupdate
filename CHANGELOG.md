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