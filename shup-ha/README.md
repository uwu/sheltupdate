# sheltupdate High Availability

This Cloudflare Worker proxies requests to the *real* sheltupdate server, and provides automatic rollover to another
origin server until the primary server comes back up again.

If all origin servers are down, it will also serve unpatched files from the Discord API, which is bad as shelter then
will not work, but it is preferable over serving nothing (Discord will just not open in this case).

It pushes webhooks when any downtime events occur.

todo: webhooks
