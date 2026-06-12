import 'package:flutter/material.dart';

/// Dark-first theme to match the existing Sector 7 web app (Tailwind dark theme).
/// Replaces shadcn/ui + Tailwind tokens with a Material 3 ColorScheme.
class AppTheme {
  const AppTheme._();

  // Brand accent (adjust to match the Sector 7 logo palette).
  static const _seed = Color(0xFF6D5DF6);

  static ThemeData get dark => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: _seed,
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF0B0B0F),
        cardTheme: const CardThemeData(
          clipBehavior: Clip.antiAlias,
          elevation: 0,
          margin: EdgeInsets.zero,
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      );
}
