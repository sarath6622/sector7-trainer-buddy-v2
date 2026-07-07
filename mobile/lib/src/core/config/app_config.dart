/// Build-time configuration. Override per flavor with:
///   flutter run --dart-define=API_BASE_URL=https://staging.sector7.app
///
/// Defaults to the local Next.js dev server. On a physical device, point this
/// at your machine's LAN IP (e.g. http://192.168.1.20:3000) — `localhost`
/// resolves to the device itself, not your dev machine.
class AppConfig {
  const AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  /// Pusher real-time (Phase 4 live session timer). Mirrors the web's
  /// NEXT_PUBLIC_PUSHER_KEY / NEXT_PUBLIC_PUSHER_CLUSTER — the same Pusher app,
  /// the same public `session-{id}` channels. Pass per flavor with
  ///   --dart-define=PUSHER_KEY=... --dart-define=PUSHER_CLUSTER=...
  /// When either is blank, real-time is disabled gracefully (no connection,
  /// screens fall back to pull-to-refresh) — same posture as the web's null
  /// Pusher client.
  static const String pusherKey = String.fromEnvironment('PUSHER_KEY');
  static const String pusherCluster = String.fromEnvironment('PUSHER_CLUSTER');

  /// True when both Pusher build-time vars are present.
  static bool get pusherEnabled =>
      pusherKey.isNotEmpty && pusherCluster.isNotEmpty;

  /// All mobile data routes are reached under `${apiBaseUrl}/api`.
  static String get apiPrefix => '$apiBaseUrl/api';

  /// Mobile-specific auth endpoints (Phase 0 backend work — see migration plan).
  static String get loginUrl => '$apiBaseUrl/api/mobile/auth/login';
  static String get refreshUrl => '$apiBaseUrl/api/mobile/auth/refresh';
  static String get meUrl => '$apiBaseUrl/api/auth/me';
}
