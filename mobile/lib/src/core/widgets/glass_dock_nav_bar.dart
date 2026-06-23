import 'dart:ui';

import 'package:flutter/material.dart';

/// Approximate rendered height of the dock body (icon + label + inner padding +
/// border), excluding the gap below it.
const double _kDockBodyHeight = 61;

/// Gap between the dock's bottom edge and the screen bottom. We deliberately sit
/// *below* the full safe-area inset — just clear of the home indicator — so the
/// dock hugs the bottom instead of floating high above it.
double _dockBottomGap(double safeBottom) =>
    safeBottom > 0 ? (safeBottom - 16).clamp(8.0, double.infinity) : 10.0;

/// Bottom padding a scrollable should use when it sits *behind* a
/// [GlassDockNavBar] (i.e. the [Scaffold] uses `extendBody: true`), so its last
/// item can scroll clear of the floating dock instead of being trapped under it.
double glassDockScrollInset(BuildContext context) {
  final safeBottom = MediaQuery.viewPaddingOf(context).bottom;
  return _dockBottomGap(safeBottom) + _kDockBodyHeight + 14;
}

/// A frosted-glass **floating dock** bottom navigation bar.
///
/// Renders as a translucent, blurred, rounded dock that floats above the screen
/// edge with a hairline border and a soft shadow — the "Frosted Floating Dock"
/// look. Each destination shows its icon above a label; the active one gets an
/// orange pill behind the icon and accent-colored text.
///
/// Drop it straight into [Scaffold.bottomNavigationBar]. It wraps itself in a
/// [SafeArea] and reserves its own height (dock + margins), so it works with the
/// default `extendBody: false` and no screen needs extra bottom padding.
class GlassDockNavBar extends StatelessWidget {
  const GlassDockNavBar({
    super.key,
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.destinations,
  });

  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final List<GlassDockDestination> destinations;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;

    // A live BackdropFilter blur is cheap on Apple GPUs (Impeller) but expensive
    // on mid-range Android, where re-blurring the scrolling content every frame
    // drops scroll frames. So we blur only on iOS; on Android a more opaque
    // frosted fill reads as glass without the per-frame backdrop cost.
    final useBlur = Theme.of(context).platform == TargetPlatform.iOS;

    final List<Color> fill;
    if (isDark) {
      fill = useBlur
          ? [
              Colors.white.withValues(alpha: 0.10),
              Colors.white.withValues(alpha: 0.04),
            ]
          : [
              const Color(0xFF34373F).withValues(alpha: 0.90),
              const Color(0xFF202229).withValues(alpha: 0.86),
            ];
    } else {
      fill = useBlur
          ? [
              Colors.white.withValues(alpha: 0.45),
              Colors.white.withValues(alpha: 0.30),
            ]
          : [
              Colors.white.withValues(alpha: 0.92),
              Colors.white.withValues(alpha: 0.86),
            ];
    }
    final borderColor = isDark
        ? Colors.white.withValues(alpha: 0.22)
        : Colors.black.withValues(alpha: 0.07);

    // The frosted surface: the gradient fill + the nav row. Wrapped in a
    // BackdropFilter only on iOS (see above).
    Widget surface = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: fill,
        ),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 5),
          child: Row(
            children: [
              for (var i = 0; i < destinations.length; i++)
                Expanded(
                  child: _GlassDockItem(
                    destination: destinations[i],
                    selected: i == selectedIndex,
                    onTap: () => onDestinationSelected(i),
                    selectedColor: scheme.onSurface,
                    mutedColor: scheme.onSurfaceVariant,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    if (useBlur) {
      surface = BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: surface,
      );
    }

    return SafeArea(
      top: false,
      bottom: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          0,
          16,
          _dockBottomGap(MediaQuery.viewPaddingOf(context).bottom),
        ),
        child: DecoratedBox(
          // Shadow lives on the outer box so the clip below doesn't crop it.
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: borderColor),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: isDark ? 0.45 : 0.14),
                blurRadius: 24,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(28),
            child: surface,
          ),
        ),
      ),
    );
  }
}

/// A single destination in a [GlassDockNavBar]: an [icon] (swapped for
/// [selectedIcon] when active) above a [label].
class GlassDockDestination {
  const GlassDockDestination({
    required this.icon,
    required this.selectedIcon,
    required this.label,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

class _GlassDockItem extends StatelessWidget {
  const _GlassDockItem({
    required this.destination,
    required this.selected,
    required this.onTap,
    required this.selectedColor,
    required this.mutedColor,
  });

  final GlassDockDestination destination;
  final bool selected;
  final VoidCallback onTap;
  final Color selectedColor;
  final Color mutedColor;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final color = selected ? selectedColor : mutedColor;
    // Neutral frosted pill behind the active icon (WhatsApp-style) — no accent.
    final pillColor = isDark
        ? Colors.white.withValues(alpha: 0.18)
        : Colors.black.withValues(alpha: 0.07);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: selected ? pillColor : Colors.transparent,
                borderRadius: BorderRadius.circular(13),
              ),
              child: Icon(
                selected ? destination.selectedIcon : destination.icon,
                size: 20,
                color: color,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              destination.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                fontSize: 11,
                height: 1.0,
                color: color,
                fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
