# sheltupdate worker

This Worker forwards requests through Cloudflare Tunnels to the actual sheltupdate nodes.
It redirects to Discord in case of any misconfigurations, this is preferable over serving
nothing so as to not prevent Discord from launching.

In the future, it will handle health reporting for the nodes, integrated into the
existing decentralized statistics infrastructure.