import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Status-bar icon styling that matches the active theme brightness.
///
/// Most tabs carry an [AppBar], which sets this automatically. The AppBar-less
/// screens (Home / Dashboard, which scroll under the Dynamic Island) don't, so
/// the shells wrap their body in an [AnnotatedRegion] using this — otherwise the
/// status-bar icons would stay light and vanish against a light background.
SystemUiOverlayStyle statusBarOverlayFor(BuildContext context) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  return SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    // Android: brightness of the icons themselves.
    statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
    // iOS: brightness of the background the icons sit on.
    statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
  );
}
