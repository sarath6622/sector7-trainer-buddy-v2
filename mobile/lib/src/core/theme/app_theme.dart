import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Material 3 theme for the Sector 7 app — an Apple-Fitness-inspired design
/// system built on the Sector 7 **orange** brand.
///
/// Philosophy: a near-black canvas in dark mode and a soft off-white canvas in
/// light mode, with subtly layered neutral surfaces, restrained borders, and
/// the bold brand orange used intentionally for calls to action and progress.
///
/// All colour values live as `static const` tokens below (orange scale, neutral
/// scale, per-mode surface/border/text groups, status colours + tints). The two
/// [ColorScheme]s are assembled from those tokens, and everything the
/// [ColorScheme] can't express (the four surface levels, three border weights,
/// four text levels, the brand scale, and status colours/tints) is carried on
/// the [AppColors] theme extension — read it anywhere via `AppColors.of(context)`.
class AppTheme {
  const AppTheme._();

  // ── Brand — Sector 7 orange (#F85800) ────────────────────────────────────
  // The single brand colour across both themes; it is the app's visual
  // signature. Variants are for hover/pressed states and tinted fills.
  static const brand = Color(0xFFF85800); // brand-primary
  static const brandHover = Color(0xFFFF6A1A);
  static const brandPressed = Color(0xFFD94C00);
  static const brandLightDark = Color(0xFFFFB080); // brand-light (dark mode)
  static const brandLightLight = Color(0xFFFFE6D7); // brand-light (light mode)

  // Back-compat aliases (older call sites referenced these names).
  static const brandOrangeDark = brand;
  static const brandOrangeLight = brand;

  /// Brand orange scale (50→900). Use for tints, charts, and stateful accents.
  static const orange50 = Color(0xFFFFF2EB);
  static const orange100 = Color(0xFFFFE6D7);
  static const orange200 = Color(0xFFFFC8A8);
  static const orange300 = Color(0xFFFFA06E);
  static const orange400 = Color(0xFFFF7A38);
  static const orange500 = brand; // #F85800 (primary)
  static const orange600 = Color(0xFFD94C00);
  static const orange700 = Color(0xFFB63F00);
  static const orange800 = Color(0xFF923300);
  static const orange900 = Color(0xFF6E2600);

  /// Shared neutral scale (Apple-system greys).
  static const neutral0 = Color(0xFFFFFFFF);
  static const neutral50 = Color(0xFFF5F5F7);
  static const neutral100 = Color(0xFFE5E5EA);
  static const neutral200 = Color(0xFFD1D1D6);
  static const neutral300 = Color(0xFFC7C7CC);
  static const neutral400 = Color(0xFF8E8E93);
  static const neutral500 = Color(0xFF636366);
  static const neutral600 = Color(0xFF48484A);
  static const neutral700 = Color(0xFF3A3A3C);
  static const neutral800 = Color(0xFF2C2C2E);
  static const neutral900 = Color(0xFF1C1C1E);
  static const neutral950 = Color(0xFF121212);
  static const neutral1000 = Color(0xFF000000);

  // ── Dark tokens (Apple-Fitness deep-black canvas) ────────────────────────
  static const darkCanvas = Color(0xFF000000); // entire app background
  static const darkSurface = Color(0xFF121212); // cards
  static const darkSurfaceSecondary = Color(0xFF1C1C1E); // expanded / nested
  static const darkSurfaceElevated = Color(0xFF2C2C2E); // bottom sheets, dialogs
  static const darkSurfaceFloating = Color(0xFF3A3A3C); // menus, floating panels
  static const darkBorderSubtle = Color(0xFF2C2C2E);
  static const darkBorder = Color(0xFF3A3A3C);
  static const darkBorderStrong = Color(0xFF4A4A4D);
  static const darkTextPrimary = Color(0xFFFFFFFF);
  static const darkTextSecondary = Color(0xFFC7C7CC);
  static const darkTextTertiary = Color(0xFF8E8E93);
  static const darkTextDisabled = Color(0xFF636366);
  static const darkSuccess = Color(0xFF30D158);
  static const darkWarning = Color(0xFFFFD60A);
  static const darkError = Color(0xFFFF453A);
  static const darkInfo = Color(0xFF0A84FF);
  static const darkSuccessBg = Color(0xFF112517);
  static const darkWarningBg = Color(0xFF2C2606);
  static const darkErrorBg = Color(0xFF2A1312);
  static const darkInfoBg = Color(0xFF0D223A);

  // ── Light tokens (soft off-white, not stark) ─────────────────────────────
  static const lightCanvas = Color(0xFFF5F5F7); // entire app background
  static const lightSurface = Color(0xFFFFFFFF); // cards
  static const lightSurfaceSecondary = Color(0xFFF2F2F7); // nested
  static const lightSurfaceElevated = Color(0xFFFFFFFF); // sheets, dialogs
  static const lightSurfaceFloating = Color(0xFFFFFFFF); // menus, floating
  static const lightBorderSubtle = Color(0xFFE5E5EA);
  static const lightBorder = Color(0xFFD1D1D6);
  static const lightBorderStrong = Color(0xFFC7C7CC);
  static const lightTextPrimary = Color(0xFF111111);
  static const lightTextSecondary = Color(0xFF4A4A4D);
  static const lightTextTertiary = Color(0xFF8E8E93);
  static const lightTextDisabled = Color(0xFFAEAEB2);
  static const lightSuccess = Color(0xFF28A745);
  static const lightWarning = Color(0xFFD97706);
  static const lightError = Color(0xFFDC2626);
  static const lightInfo = Color(0xFF2563EB);
  static const lightSuccessBg = Color(0xFFEAF8EF);
  static const lightWarningBg = Color(0xFFFFF7D6);
  static const lightErrorBg = Color(0xFFFDECEC);
  static const lightInfoBg = Color(0xFFEAF3FF);

  /// Chart palette (fl_chart series). A monochrome spread of the brand orange
  /// so progress charts read as one brand-coloured family. Index 0 is brand.
  static const chartsDark = <Color>[
    brand, // chart-1  #F85800
    orange400, // chart-2 #FF7A38
    orange600, // chart-3 #D94C00
    orange300, // chart-4 #FFA06E
    orange700, // chart-5 #B63F00
  ];
  static const chartsLight = <Color>[
    brand, // chart-1  #F85800
    orange600, // chart-2 #D94C00
    orange700, // chart-3 #B63F00
    orange400, // chart-4 #FF7A38
    orange800, // chart-5 #923300
  ];

  // ── Theme-extension bundles ──────────────────────────────────────────────
  static const _darkColors = AppColors(
    canvas: darkCanvas,
    surface: darkSurface,
    surfaceSecondary: darkSurfaceSecondary,
    surfaceElevated: darkSurfaceElevated,
    surfaceFloating: darkSurfaceFloating,
    borderSubtle: darkBorderSubtle,
    border: darkBorder,
    borderStrong: darkBorderStrong,
    textPrimary: darkTextPrimary,
    textSecondary: darkTextSecondary,
    textTertiary: darkTextTertiary,
    textDisabled: darkTextDisabled,
    brand: brand,
    brandHover: brandHover,
    brandPressed: brandPressed,
    brandLight: brandLightDark,
    success: darkSuccess,
    warning: darkWarning,
    error: darkError,
    info: darkInfo,
    successBg: darkSuccessBg,
    warningBg: darkWarningBg,
    errorBg: darkErrorBg,
    infoBg: darkInfoBg,
  );

  static const _lightColors = AppColors(
    canvas: lightCanvas,
    surface: lightSurface,
    surfaceSecondary: lightSurfaceSecondary,
    surfaceElevated: lightSurfaceElevated,
    surfaceFloating: lightSurfaceFloating,
    borderSubtle: lightBorderSubtle,
    border: lightBorder,
    borderStrong: lightBorderStrong,
    textPrimary: lightTextPrimary,
    textSecondary: lightTextSecondary,
    textTertiary: lightTextTertiary,
    textDisabled: lightTextDisabled,
    brand: brand,
    brandHover: brandHover,
    brandPressed: brandPressed,
    brandLight: brandLightLight,
    success: lightSuccess,
    warning: lightWarning,
    error: lightError,
    info: lightInfo,
    successBg: lightSuccessBg,
    warningBg: lightWarningBg,
    errorBg: lightErrorBg,
    infoBg: lightInfoBg,
  );

  // shadcn --radius is 0.625rem (10px); cards/sheets use the xl step (~14px).
  static const _radius = 10.0;
  static const _radiusLg = 14.0;

  // ── Dark scheme ──────────────────────────────────────────────────────────
  static const _darkScheme = ColorScheme.dark(
    primary: brand,
    onPrimary: Color(0xFFFFFFFF),
    primaryContainer: brand,
    onPrimaryContainer: Color(0xFFFFFFFF),
    secondary: darkSurfaceSecondary, // neutral muted surface (chips/badges)
    onSecondary: darkTextPrimary,
    secondaryContainer: darkSurfaceSecondary,
    onSecondaryContainer: darkTextPrimary,
    tertiary: brandLightDark, // soft brand accent
    onTertiary: darkSurfaceSecondary,
    error: darkError,
    onError: Color(0xFFFFFFFF),
    surface: darkCanvas, // entire-app background
    onSurface: darkTextPrimary, // primary text
    surfaceContainerLowest: darkCanvas,
    surfaceContainerLow: darkSurface, // cards / popovers / sheets / nav
    surfaceContainer: darkSurfaceSecondary,
    surfaceContainerHigh: darkSurfaceElevated,
    surfaceContainerHighest: darkSurfaceFloating,
    onSurfaceVariant: darkTextSecondary, // secondary text
    outline: darkBorder, // input borders
    outlineVariant: darkBorderSubtle, // dividers / hairlines
  );

  // ── Light scheme ─────────────────────────────────────────────────────────
  static const _lightScheme = ColorScheme.light(
    primary: brand,
    onPrimary: Color(0xFFFFFFFF),
    primaryContainer: brand,
    onPrimaryContainer: Color(0xFFFFFFFF),
    secondary: lightSurfaceSecondary,
    onSecondary: lightTextPrimary,
    secondaryContainer: lightSurfaceSecondary,
    onSecondaryContainer: lightTextPrimary,
    tertiary: brandPressed,
    onTertiary: Color(0xFFFFFFFF),
    error: lightError,
    onError: Color(0xFFFFFFFF),
    surface: lightCanvas, // entire-app background
    onSurface: lightTextPrimary,
    surfaceContainerLowest: lightSurface,
    surfaceContainerLow: lightSurface, // cards
    surfaceContainer: lightSurfaceSecondary,
    surfaceContainerHigh: lightSurface,
    surfaceContainerHighest: lightSurfaceSecondary,
    onSurfaceVariant: lightTextSecondary,
    outline: lightBorder,
    outlineVariant: lightBorderSubtle,
  );

  static ThemeData get dark => _build(_darkScheme, _darkColors);
  static ThemeData get light => _build(_lightScheme, _lightColors);

  static ThemeData _build(ColorScheme scheme, AppColors colors) {
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
      extensions: <ThemeExtension<dynamic>>[colors],
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
        backgroundColor: scheme.surfaceContainerHigh,
        surfaceTintColor: Colors.transparent,
        shape: lgShape,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surfaceContainerHigh,
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

/// Semantic colour tokens that [ColorScheme] can't represent: the four surface
/// levels, three border weights, four text levels, the brand scale, and the
/// status colours + their background tints. Resolved per brightness and carried
/// on [ThemeData.extensions]; read it with `AppColors.of(context)`.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.canvas,
    required this.surface,
    required this.surfaceSecondary,
    required this.surfaceElevated,
    required this.surfaceFloating,
    required this.borderSubtle,
    required this.border,
    required this.borderStrong,
    required this.textPrimary,
    required this.textSecondary,
    required this.textTertiary,
    required this.textDisabled,
    required this.brand,
    required this.brandHover,
    required this.brandPressed,
    required this.brandLight,
    required this.success,
    required this.warning,
    required this.error,
    required this.info,
    required this.successBg,
    required this.warningBg,
    required this.errorBg,
    required this.infoBg,
  });

  final Color canvas;
  final Color surface;
  final Color surfaceSecondary;
  final Color surfaceElevated;
  final Color surfaceFloating;
  final Color borderSubtle;
  final Color border;
  final Color borderStrong;
  final Color textPrimary;
  final Color textSecondary;
  final Color textTertiary;
  final Color textDisabled;
  final Color brand;
  final Color brandHover;
  final Color brandPressed;
  final Color brandLight;
  final Color success;
  final Color warning;
  final Color error;
  final Color info;
  final Color successBg;
  final Color warningBg;
  final Color errorBg;
  final Color infoBg;

  /// The active [AppColors] for the current theme.
  static AppColors of(BuildContext context) =>
      Theme.of(context).extension<AppColors>()!;

  @override
  AppColors copyWith({
    Color? canvas,
    Color? surface,
    Color? surfaceSecondary,
    Color? surfaceElevated,
    Color? surfaceFloating,
    Color? borderSubtle,
    Color? border,
    Color? borderStrong,
    Color? textPrimary,
    Color? textSecondary,
    Color? textTertiary,
    Color? textDisabled,
    Color? brand,
    Color? brandHover,
    Color? brandPressed,
    Color? brandLight,
    Color? success,
    Color? warning,
    Color? error,
    Color? info,
    Color? successBg,
    Color? warningBg,
    Color? errorBg,
    Color? infoBg,
  }) {
    return AppColors(
      canvas: canvas ?? this.canvas,
      surface: surface ?? this.surface,
      surfaceSecondary: surfaceSecondary ?? this.surfaceSecondary,
      surfaceElevated: surfaceElevated ?? this.surfaceElevated,
      surfaceFloating: surfaceFloating ?? this.surfaceFloating,
      borderSubtle: borderSubtle ?? this.borderSubtle,
      border: border ?? this.border,
      borderStrong: borderStrong ?? this.borderStrong,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textTertiary: textTertiary ?? this.textTertiary,
      textDisabled: textDisabled ?? this.textDisabled,
      brand: brand ?? this.brand,
      brandHover: brandHover ?? this.brandHover,
      brandPressed: brandPressed ?? this.brandPressed,
      brandLight: brandLight ?? this.brandLight,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      error: error ?? this.error,
      info: info ?? this.info,
      successBg: successBg ?? this.successBg,
      warningBg: warningBg ?? this.warningBg,
      errorBg: errorBg ?? this.errorBg,
      infoBg: infoBg ?? this.infoBg,
    );
  }

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    return AppColors(
      canvas: Color.lerp(canvas, other.canvas, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceSecondary: Color.lerp(surfaceSecondary, other.surfaceSecondary, t)!,
      surfaceElevated: Color.lerp(surfaceElevated, other.surfaceElevated, t)!,
      surfaceFloating: Color.lerp(surfaceFloating, other.surfaceFloating, t)!,
      borderSubtle: Color.lerp(borderSubtle, other.borderSubtle, t)!,
      border: Color.lerp(border, other.border, t)!,
      borderStrong: Color.lerp(borderStrong, other.borderStrong, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textTertiary: Color.lerp(textTertiary, other.textTertiary, t)!,
      textDisabled: Color.lerp(textDisabled, other.textDisabled, t)!,
      brand: Color.lerp(brand, other.brand, t)!,
      brandHover: Color.lerp(brandHover, other.brandHover, t)!,
      brandPressed: Color.lerp(brandPressed, other.brandPressed, t)!,
      brandLight: Color.lerp(brandLight, other.brandLight, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      error: Color.lerp(error, other.error, t)!,
      info: Color.lerp(info, other.info, t)!,
      successBg: Color.lerp(successBg, other.successBg, t)!,
      warningBg: Color.lerp(warningBg, other.warningBg, t)!,
      errorBg: Color.lerp(errorBg, other.errorBg, t)!,
      infoBg: Color.lerp(infoBg, other.infoBg, t)!,
    );
  }
}
