import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Persisted app theme mode (system / light / dark).
///
/// Defaults to [ThemeMode.system] so the app follows the phone's appearance
/// until the user picks an explicit override in Settings. The choice is stored
/// in [SharedPreferences] and restored on the next launch. Because the default
/// is `system`, the first frame already respects the OS setting — no flash
/// while the saved value loads asynchronously.
final themeModeProvider = StateNotifierProvider<ThemeModeController, ThemeMode>(
  (ref) => ThemeModeController(),
);

class ThemeModeController extends StateNotifier<ThemeMode> {
  ThemeModeController() : super(ThemeMode.system) {
    _load();
  }

  static const _prefsKey = 'theme_mode';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_prefsKey);
    if (saved != null) state = _decode(saved);
  }

  /// Switch the active theme mode and persist it.
  Future<void> setMode(ThemeMode mode) async {
    if (mode == state) return;
    state = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, _encode(mode));
  }

  static ThemeMode _decode(String v) => switch (v) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };

  static String _encode(ThemeMode m) => switch (m) {
    ThemeMode.light => 'light',
    ThemeMode.dark => 'dark',
    ThemeMode.system => 'system',
  };
}
