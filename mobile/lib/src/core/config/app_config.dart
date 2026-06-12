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

  /// All mobile data routes are reached under `${apiBaseUrl}/api`.
  static String get apiPrefix => '$apiBaseUrl/api';

  /// Mobile-specific auth endpoints (Phase 0 backend work — see migration plan).
  static String get loginUrl => '$apiBaseUrl/api/mobile/auth/login';
  static String get refreshUrl => '$apiBaseUrl/api/mobile/auth/refresh';
  static String get meUrl => '$apiBaseUrl/api/auth/me';
}
