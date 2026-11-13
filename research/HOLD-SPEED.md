# Fullscreen hold-to-speed — 1.2.0

Request: holding the movie surface on a phone should play at 2x instead of opening the browser's long-press menu, only in fullscreen.

## Implementation

Independent `holdSpeed` setting, on by default for selected sites including existing records. It does not depend on ad skipping. A dedicated MAIN-world script uses Pointer Events, with a Touch Events fallback. It requires a playing, visible video inside the current Fullscreen API element, a same-origin fullscreen frame, or a WebKit video fullscreen indication.

A 350ms hold sets playbackRate to exactly 2. Releasing restores the previous rate, which can be something other than 1. defaultPlaybackRate is never changed. The small 2× badge is appended within a DOM fullscreen player so it stays visible in the fullscreen layer.

Quick taps and controls are not intercepted. Buttons, sliders, known control bars and the bottom native-control region are excluded. Moving more than 12 CSS pixels, multitouch, cancellation, fullscreen exit, pause, source replacement, video removal, blur, page hiding, or disabling protection cancels the gesture. An independent rate change is respected. The click generated after a completed hold is suppressed; the next deliberate press clears that suppression.

The browser contextmenu is canceled only for a qualifying fullscreen touch/pen hold. A short-lived guard also handles contextmenu arriving after pointercancel. Touch endings provide cleanup when pointerup is lost. Callout and text-selection styles are scoped to fullscreen and restored afterwards. Desktop context menus and non-fullscreen playback remain unchanged.

## Practical scope

This cannot manufacture DOM touch events when an operating-system/native fullscreen player does not deliver them. Cross-origin embedded players must be included in the extension's selected domains, and must expose a usable fullscreen/input surface in their own document. No viewport-size guess is used to treat ordinary pages as fullscreen.

No phone hardware or live movie playback is claimed as tested. Automated coverage uses jsdom, mocked fullscreen state and accelerated timers. The user has chosen to self-test real devices. The implementation is not a guarantee against every mobile browser's native long-press UI.

## Primary references

- [Fullscreen element](https://developer.mozilla.org/en-US/docs/Web/API/Document/fullscreenElement)
- [Media playbackRate](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate)
- [Context menu cancellation](https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event)
- [Pointer input and cancellation](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [WebKit touch callout](https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-touch-callout)
