# Chophim domain migration — 1.2.1

The old adapter recognized only chophim.lol. A user-selected entry for that domain also does not authorize injection on chophim.cfd. Both are relevant when a website moves domains.

## Current public-source evidence

Fetched without a browser using the api-reverse asset fetcher and HTTP clients:

- `https://chophim.cfd/`: HTTP 200, canonical URL points to chophim.cfd.
- `https://chophim.cfd/xem/bac-si-x-mafia-ao-trang`: HTTP 200.
- The watch page references `/_next/static/chunks/76e29811c1f97fa1.js`.
- This chunk still reads search parameter tvc=1 and initializes the completed-TVC state from it. The TVC video still has an onEnded completion callback.
- The TVC wrapper retains role=link and the exact label Tiếp tục xem trong tab mới. Its sound button retains Bật tiếng TVC / Tắt tiếng TVC. The advertising click path still opens the current movie with tvc=1 before assigning the ad destination.

The protocol has not changed in the inspected bundle; the domain-specific adapter restriction was stale.

## Fix

Verified Chophim host recognition is centralized in core and includes chophim.lol and chophim.cfd, plus real subdomains. Lookalike suffixes are excluded. The verified domains use eager tvc=1 navigation and the existing popunder timestamp fallback.

A selected future host can also use the completion fallback if its DOM contains both the exact TVC wrapper and the specific TVC sound-control label. It does not gain a general URL-query rewrite merely because its hostname resembles Chophim. Unrelated videos remain untouched.

Completion retries are throttled to at most once per 700ms per video rather than exhausting eight attempts during an early burst of React mutations before hydration attaches the callback.

No website is automatically added to the user's protection list. The user must add chophim.cfd, turn on TVC skipping, and reload the movie page after updating.

Six new regression tests cover the new domain, suffix boundaries, episode query/hash preservation, completion without modifying the movie, delayed hydration on a fingerprinted migrated host, negative fingerprint cases and the unchanged domain-list boundary. The suite passes 63 simulated tests in total; no live browser/movie-playback test is claimed.
