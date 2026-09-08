# Security

This bundle is a small stdio-to-HTTP shim that runs inside Claude Desktop on
its own Node runtime and talks only to Virgil on the same Mac, over the
loopback interface, with a per-install secret token Virgil writes to a file
readable only by the user. It has no dependencies.

If you find a vulnerability in the shim, the manifest or the way Virgil
publishes the token, please report it through the feedback form at
<https://virgil.app/feedback> rather than in a public issue, so it can be fixed
before it is discussed. Say "security" in the first line. Reports are read by
the people who ship Virgil, and you will hear back.

The same form is the support contact for the extension.
