import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Skeleton loading primitives — an animated shimmer placeholder system that
/// replaces spinners on content-load states.
///
/// Usage: lay out grey [Bone] placeholders that mirror the real content, then
/// wrap the whole tree in a single [Shimmer] to animate a light sweep across
/// them. The sweep only touches opaque pixels (the bones); transparent gaps
/// stay as the scaffold background, so the layout reads as "content shape, not
/// yet loaded".
///
/// Theme-aware: tuned for both the dark-first palette and the light theme.

/// A single grey placeholder block (rounded rectangle or circle). Paints in the
/// muted "bone" colour; the surrounding [Shimmer] animates the highlight over
/// it. Safe to use on its own (renders a static bone) but normally lives inside
/// a [Shimmer].
class Bone extends StatelessWidget {
  const Bone({
    super.key,
    this.width,
    this.height = 14,
    this.radius = 8,
  }) : _shape = BoxShape.rectangle;

  /// A circular bone (avatars, dots). [size] is the diameter.
  const Bone.circle({super.key, required double size})
      : width = size,
        height = size,
        radius = 0,
        _shape = BoxShape.circle;

  final double? width;
  final double height;
  final double radius;
  final BoxShape _shape;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh,
        shape: _shape,
        borderRadius:
            _shape == BoxShape.rectangle ? BorderRadius.circular(radius) : null,
      ),
    );
  }
}

/// Animates a moving light band across every opaque descendant — wrap a tree of
/// [Bone]s with this once at the top of a skeleton layout.
class Shimmer extends StatefulWidget {
  const Shimmer({super.key, required this.child});

  final Widget child;

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = AppColors.of(context);
    final isDark = scheme.brightness == Brightness.dark;
    final base = scheme.surfaceContainerHigh;
    // A lighter band sweeps over the base bone colour in both themes.
    final highlight =
        isDark ? colors.surfaceFloating : const Color(0xFFF7F7F7);

    return AnimatedBuilder(
      animation: _controller,
      child: widget.child,
      builder: (context, child) {
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (bounds) {
            return LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: [base, highlight, base],
              stops: const [0.35, 0.5, 0.65],
              transform: _SlideTransform(_controller.value),
            ).createShader(bounds);
          },
          child: child,
        );
      },
    );
  }
}

/// Slides the shimmer gradient from off-screen-left to off-screen-right as the
/// controller advances 0 → 1.
class _SlideTransform extends GradientTransform {
  const _SlideTransform(this.t);

  final double t;

  @override
  Matrix4 transform(Rect bounds, {TextDirection? textDirection}) {
    final dx = bounds.width * (t * 2 - 1) * 1.5;
    return Matrix4.translationValues(dx, 0, 0);
  }
}

/// A ready-made vertical list of card-shaped bones — the default placeholder
/// for screens that load a list of items. Non-scrollable so it drops straight
/// into a `loading:` branch (often itself inside a [RefreshIndicator]).
class SkeletonList extends StatelessWidget {
  const SkeletonList({
    super.key,
    this.itemCount = 6,
    this.itemHeight = 96,
    this.padding = const EdgeInsets.fromLTRB(16, 12, 16, 24),
  });

  final int itemCount;
  final double itemHeight;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView.separated(
        padding: padding,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: itemCount,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (_, _) => _CardBone(height: itemHeight),
      ),
    );
  }
}

/// A single card-shaped placeholder: avatar + two text lines + a wide footer
/// bar. Generic enough to stand in for most list rows in the app.
class _CardBone extends StatelessWidget {
  const _CardBone({required this.height});

  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Bone.circle(size: 44),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Bone(width: 150, height: 13),
                    SizedBox(height: 8),
                    Bone(width: 90, height: 11),
                  ],
                ),
              ),
            ],
          ),
          const Spacer(),
          const Bone(width: double.infinity, height: 10, radius: 999),
        ],
      ),
    );
  }
}
