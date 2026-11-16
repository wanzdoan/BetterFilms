# Google sign-in compatibility — 1.2.2

The old popup policy blocked all new windows and the browser fallback closed all unrecorded tabs from protected sites. Redirect blocking was a third independent failure point for Google sign-in. This update addresses all three layers with one shared policy in auth-policy.js, loaded in MAIN, ISOLATED and the service worker.

## Recognized starts

- HTTPS accounts.google.com OAuth authorization and GIS select entries with client_id, including AccountChooser/ServiceLogin wrappers that continue to one of these entries.
- Specific same-origin Google sign-in starters, including /api/auth/signin/google and /api/auth/google.
- Firebase's /__/auth/handler for providerId=google.com and popup auth types, on the same origin or the Firebase project auth domains.

The page hook allows a recognized auth window following user activation/a trusted Google-control click. It returns the native WindowProxy unchanged, preserving opener, window name and features. Auth anchors are not relayed through tabs.create. There is no sign-in automation, credential extraction or token logging.

The DNR cross-site block excludes only the accounts.google.com destination and has a higher-priority, initiator-scoped Firebase Google-handler exception. Other Google services, lookalike hosts and unrelated Firebase URLs are not exempted.

## Blank SDK bootstrap

A real Google-control click can authorize one short-lived blank bootstrap. The worker can also recognize the genuine Google sign-in button's iframe as its source. Unknown blank windows stay blocked. A pending login bootstrap is closed if it navigates to an unrelated URL or fails to start login within ten seconds; pending Google navigation is respected on slow loads. A public source-origin marker permits only the inherited blank document's auth navigation through the MAIN guard. No private OAuth parameters are transferred through that marker.

After the popup reaches recognized Google/auth navigation, the temporary bootstrap guard is removed. Google can complete its normal postMessage/opener or redirect callback. Other popup/ad behavior remains subject to the original guards.

## Validation and scope

Tests cover native proxy/opener preservation, activation, one-use blank windows, auth redirects, scoped DNR exceptions, opaque Google widget frames, expiry, pending loads, disallowed destinations and lookalike domains. These are DOM/API simulations, not a completed Google sign-in with a real account. Custom third-party OAuth brokers outside the recognized paths can still need a separate adapter. Existing browser popup, cookie and account policies remain in effect.

Primary references:

- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Sign-In JavaScript reference](https://developers.google.com/identity/gsi/web/reference/js-reference)
- [Firebase Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)
