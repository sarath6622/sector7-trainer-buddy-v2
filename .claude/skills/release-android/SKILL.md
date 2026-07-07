---
name: release-android
description: Build a signed release APK (QA backend baked in) and upload it to Firebase App Distribution for the internal Android beta. Use when asked to cut a beta build, distribute the Android app to testers, ship a release APK, or push a new build to Firebase App Distribution. iOS beta is gated on a paid Apple account and is out of scope.
---

# Cut an Android beta (Firebase App Distribution)

Builds a **signed** release APK with the beta backend baked in and uploads it to
**Firebase App Distribution** for internal testers. Per **ADR-047**: Android-only
(no paid Apple account), backend = the `qa` Vercel deploy, control via Remote
Config flags + the force-update gate. Production PWA (`main`) is untouched.

## Release

```bash
.claude/skills/release-android/release.sh            # build + distribute to group "beta"
.claude/skills/release-android/release.sh staff      # ...to a different tester group
```

Env overrides: `API_BASE_URL` (backend baked in; default = `run-mobile/qa-url.local`),
`FAD_GROUPS` / `FAD_TESTERS` (group alias vs explicit emails), `FAD_NOTES` (release notes).

## Before the FIRST release (one-time)

1. **Enable App Distribution** in the Firebase console (Release & Monitor → App
   Distribution) and **create a tester group** (default alias the skill uses: `beta`),
   or distribute to explicit emails via `FAD_TESTERS=a@x.com,b@y.com`.
2. Testers accept the email invite + install the **Firebase App Tester** app on
   their Android device; updates then arrive as notifications.
3. `firebase login` must be done (it is — see the `deploy-qa`/setup history).

## Bump the build number every release

`pubspec.yaml` `version:` must carry a `+buildNumber` (e.g. `0.1.0+3`) — that
becomes the Android `versionCode`. Bump the `+N` before each release so:

- the **force-update gate** can target it (`min_supported_build` in Remote Config), and
- App Distribution sees a distinct build.

The skill warns if `version:` has no `+N`.

## Controlling testers after release (Remote Config)

The beta is controlled live from the Firebase console → Remote Config:

- **`min_supported_build`** — set to a versionCode to force everyone below it onto
  the force-update screen (kill-switch for a broken build). `0` disables the gate.
- **`update_message`** — optional copy shown on that screen.
- Add **boolean params** for feature flags; read them via `FeatureFlags.isEnabled('key')`
  (default OFF). Ship features dark, then flip on per cohort / % rollout.

Flags live in [feature_flags.dart](mobile/lib/src/core/flags/feature_flags.dart);
fetch/activate + providers in
[remote_config_service.dart](mobile/lib/src/core/flags/remote_config_service.dart).

## The loop

```bash
# 1. change code, bump pubspec version +N, commit on the dev branch
# 2. (if backend changed) deploy it:
.claude/skills/deploy-qa/deploy.sh
# 3. cut + distribute the Android beta:
.claude/skills/release-android/release.sh
```

## Notes / gotchas

- **iOS is not handled** — needs the paid Apple Developer Program (TestFlight).
  Until then iOS stays on local `flutter run` installs (see `run-mobile`).
- The release APK is signed with the **upload keystore** from `android/key.properties`
  (gitignored). Back up `mobile/android/app/upload-keystore.jks` + its password — losing
  it means testers must uninstall/reinstall to update.
- R8 minification is on; `android/app/proguard-rules.pro` carries the slf4j
  `-dontwarn`. Dart stack traces in Crashlytics are unaffected by R8.
- Gradle must use the Android Studio JBR, not system Java 25 (Flutter handles this
  automatically; a bare `./gradlew` would fail on a Kotlin/Java-25 mismatch).
