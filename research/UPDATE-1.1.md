# BetterFilms 1.1.0

This update supersedes the optional-permission and popup-design descriptions in the original 1.0 research reports.

## Changes

- Renamed Still to BetterFilms. New image_gen abstract ribbon logo, replacing the monogram. All runtime sizes and UI references use the generated artwork.
- Popup uses its own stylesheet, an explicitly sized 360px document and body, explicit Inter font inheritance, minmax(0,1fr) action columns and short labels. Removed slogans, toggle descriptions and peripheral copy. Manual domain entry is collapsed by default. Success messages expire; errors remain visible. Options use the same new branding and less copy.
- All HTTP/HTTPS host access is declared at installation, as requested. Adding a site invokes no permissions.request call. The stored site list and runtime registration/rules still start empty. Removing a site removes its protection, not the shared install-time host grant. Browser-level user restrictions still cannot be bypassed.
- Corrected same-site open(url, '_self') handling, based on Phimhdcss's actual episode handler. New-tab opens, foreign _self destinations, blank URLs and unsafe schemes remain blocked.

## Phimhdcss evidence

Fetched public HTML and referenced assets using the api-reverse CLI fetcher. Public detail URL: https://phimhdcss.com/gap-anh-trang-36261 . Episode href observed: https://phimhdcss.com/gap-anh-trang/tap-1-866338 .

`/js/hdc-common-ui.js?v=1.2.8-phase1-20260928` defines initNoLink. After 500ms it selects `a[href]#no-link`, saves href in a closure, removes the href attribute, and registers a click handler that calls window.open(href, '_self'). Blocking all calls to open prevents episode navigation. The correction allows this same-tab, same-site case without allowing the popup/foreign-navigation cases.

The exact initNoLink function and original jQuery asset are kept as regression fixtures. Test runs the original function, confirms href removal, clicks the resulting element and verifies that native same-tab navigation is reached.

## Verification

36 Node/jsdom/mock-Chrome tests pass, including the two new episode-navigation regressions. Production syntax/manifest/assets checks pass. UI source lint: 0 FAIL, 0 WARN. PNG icon dimensions: 16, 32, 48, 128.

At the user's request, live browser testing of the updated extension and movie playback is left to the user. No claim of browser pixel verification or end-to-end playback testing is made. Temporary browser sessions used to prepare a local preview were closed when the user asked to self-test.
