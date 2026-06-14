import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Material 3 theme that mirrors the Sector 7 web app (shadcn/Tailwind tokens).
///
/// The PWA is dark-first, built on the Sector 7 **orange** brand over neutral
/// grays. Every value below is the exact sRGB conversion of the OKLCH tokens in
/// `src/app/globals.css` (`:root` = light, `.dark` = dark) so the two clients
/// render the same palette. Keep them in sync: if a token changes in
/// `globals.css`, re-convert and update here.
class AppTheme {
  const AppTheme._();

  // ── Brand ───────────────────────────────────────────────────────────────
  // The Sector 7 orange. Light = oklch(0.58 0.179 38.5), dark = oklch(0.637 …).
  static const brandOrangeLight = Color(0xFFCD4712);
  static const brandOrangeDark = Color(0xFFE15A2B);

  /// Chart palette (maps to --chart-1..5). fl_chart series can read these so
  /// progress charts match the web's Recharts colors. Index 0 is the brand.
  static const chartsDark = <Color>[
    Color(0xFFE15A2B), // chart-1  oklch(0.637 0.179 38.5)
    Color(0xFFE77F3E), // chart-2  oklch(0.7 0.15 50)
    Color(0xFFCC2A1B), // chart-3  oklch(0.55 0.2 30)
    Color(0xFFDD9F6B), // chart-4  oklch(0.75 0.1 60)
    Color(0xFFA83634), // chart-5  oklch(0.5 0.15 25)
  ];
  static const chartsLight = <Color>[
    Color(0xFFCD4712), // chart-1  oklch(0.58 0.179 38.5)
    Color(0xFFC46016), // chart-2  oklch(0.6 0.15 50)
    Color(0xFFBA0D01), // chart-3  oklch(0.5 0.2 30)
    Color(0xFFBC804D), // chart-4  oklch(0.65 0.1 60)
    Color(0xFF972527), // chart-5  oklch(0.45 0.15 25)
  ];

  // shadcn --radius is 0.625rem (10px); cards/sheets use the xl step (~14px).
  static const _radius = 10.0;
  static const _radiusLg = 14.0;

  // ── Dark (default — matches .dark in globals.css) ────────────────────────
  static const _darkScheme = ColorScheme.dark(
    primary: brandOrangeDark, // --primary
    onPrimary: Color(0xFFFFFFFF), // --primary-foreground oklch(1 0 0)
    primaryContainer: brandOrangeDark,
    onPrimaryContainer: Color(0xFFFFFFFF),
    secondary: Color(0xFF1B1B1B), // --secondary  oklch(0.22 0 0)
    onSecondary: Color(0xFFFAFAFA), // --secondary-foreground
    secondaryContainer: Color(0xFF1B1B1B),
    onSecondaryContainer: Color(0xFFFAFAFA),
    tertiary: Color(0xFFE77F3E), // --chart-2 (warm accent)
    onTertiary: Color(0xFF1B1B1B),
    error: Color(0xFFFF6467), // --destructive oklch(0.704 0.191 22.216)
    onError: Color(0xFFFFFFFF),
    surface: Color(0xFF070707), // --background oklch(0.13 0 0)
    onSurface: Color(0xFFFAFAFA), // --foreground oklch(0.985 0 0)
    surfaceContainerLowest: Color(0xFF070707),
    surfaceContainerLow: Color(0xFF0F0F0F), // --card / --popover
    surfaceContainer: Color(0xFF0F0F0F),
    surfaceContainerHigh: Color(0xFF1B1B1B), // --muted
    surfaceContainerHighest: Color(0xFF1B1B1B), // --muted
    onSurfaceVariant: Color(0xFF8F8F8F), // --muted-foreground oklch(0.65 0 0)
    outline: Color(0x26FFFFFF), // --input  (white / 15%)
    outlineVariant: Color(0x1FFFFFFF), // --border (white / 12%)
  );

  // ── Light (matches :root in globals.css) ─────────────────────────────────
  static const _lightScheme = ColorScheme.light(
    primary: brandOrangeLight, // --primary
    onPrimary: Color(0xFFFFFFFF), // --primary-foreground
    primaryContainer: brandOrangeLight,
    onPrimaryContainer: Color(0xFFFFFFFF),
    secondary: Color(0xFFF0EAE5), // --secondary  oklch(0.94 0.01 60)
    onSecondary: Color(0xFF161616), // --secondary-foreground
    secondaryContainer: Color(0xFFF0EAE5),
    onSecondaryContainer: Color(0xFF161616),
    tertiary: Color(0xFFC46016), // --chart-2
    onTertiary: Color(0xFFFFFFFF),
    error: Color(0xFFCC272E), // --destructive oklch(0.55 0.2 25)
    onError: Color(0xFFFFFFFF),
    surface: Color(0xFFF8F8F8), // --background oklch(0.98 0 0)
    onSurface: Color(0xFF090909), // --foreground oklch(0.14 0 0)
    surfaceContainerLowest: Color(0xFFFFFFFF),
    surfaceContainerLow: Color(0xFFFFFFFF), // --card oklch(1 0 0)
    surfaceContainer: Color(0xFFFFFFFF),
    surfaceContainerHigh: Color(0xFFEBEBEB), // --muted
    surfaceContainerHighest: Color(0xFFEBEBEB), // --muted
    onSurfaceVariant: Color(0xFF555555), // --muted-foreground oklch(0.45 0 0)
    outline: Color(0x1A000000), // --input  (black / 10%)
    outlineVariant: Color(0x14000000), // --border (black / 8%)
  );

  static ThemeData get dark => _build(_darkScheme);
  static ThemeData get light => _build(_lightScheme);

  static ThemeData _build(ColorScheme scheme) {
    final lgShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(_radiusLg),
    );
    final fieldRadius = BorderRadius.circular(_radius);

    // Inter for everything, mirroring the PWA's --font-sans. Seed from the
    // brightness-correct Material baseline so text colors stay legible.
    final baseText = scheme.brightness == Brightness.dark
        ? Typography.material2021().white
        : Typography.material2021().black;
    final interText = GoogleFonts.interTextTheme(baseText);

    return ThemeData(
      useMaterial3: true,
      brightness: scheme.brightness,
      colorScheme: scheme,
      textTheme: interText,
      scaffoldBackgroundColor: scheme.surface,
      cardTheme: CardThemeData(
        clipBehavior: Clip.antiAlias,
        elevation: 0,
        margin: EdgeInsets.zero,
        color: scheme.surfaceContainerLow,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(_radiusLg),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        shape: lgShape,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(_radiusLg),
          ),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        indicatorColor: scheme.primary.withValues(alpha: 0.16),
        elevation: 0,
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerLow,
        border: OutlineInputBorder(
          borderRadius: fieldRadius,
          borderSide: BorderSide(color: scheme.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: fieldRadius,
          borderSide: BorderSide(color: scheme.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: fieldRadius,
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: fieldRadius,
          borderSide: BorderSide(color: scheme.error),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: fieldRadius),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: fieldRadius),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          side: BorderSide(color: scheme.outline),
          shape: RoundedRectangleBorder(borderRadius: fieldRadius),
        ),
      ),
    );
  }
}
