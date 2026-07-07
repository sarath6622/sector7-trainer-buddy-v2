import 'package:flutter/material.dart';

/// A fixed dark→transparent gradient pinned to the very top of the screen, sized
/// to the status-bar / Dynamic Island strip.
///
/// Overlay it on top of a tab's scroll view (e.g. in a [Stack]) so list content
/// can scroll edge-to-edge *under* the island while staying legible — the
/// WhatsApp-style top fade. It ignores pointer events, so taps pass through.
class TopFadeScrim extends StatelessWidget {
  const TopFadeScrim({super.key, this.extra = 12});

  /// Extra height the fade extends below the top safe-area inset.
  final double extra;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.viewPaddingOf(context).top;
    final surface = Theme.of(context).colorScheme.surface;
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      height: top + extra,
      child: IgnorePointer(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              // Opaque behind the island, fading to clear just below it.
              colors: [surface, surface.withValues(alpha: 0)],
              stops: const [0.6, 1.0],
            ),
          ),
        ),
      ),
    );
  }
}
