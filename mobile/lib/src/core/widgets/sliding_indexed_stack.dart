import 'package:flutter/material.dart';

/// An [IndexedStack]-style switcher that keeps every child mounted — preserving
/// scroll position and avoiding refetches, exactly like [IndexedStack] — but
/// *slides* the newly-selected child in from the side on each index change.
///
/// The direction follows the index delta: moving to a higher index slides the
/// new page in from the right (and the previous one out to the left), and a
/// lower index does the reverse — so it reads like swiping across a row of tabs.
///
/// Only the outgoing and incoming pages paint during the transition; every other
/// tab stays [Offstage] (mounted and laid out, just not painted), so the cost is
/// the same two-screen composite as a [PageView] swipe with no extra rebuilds.
/// Each child keeps a stable widget structure across builds (always the same
/// `Offstage → FractionalTranslation → RepaintBoundary` wrapper) so its element —
/// and therefore its [State], scroll offset and fetched data — survives every
/// transition. The [RepaintBoundary] lets the slide re-composite a cached layer
/// instead of repainting the page each frame.
class SlidingIndexedStack extends StatefulWidget {
  const SlidingIndexedStack({
    super.key,
    required this.index,
    required this.children,
    this.duration = const Duration(milliseconds: 280),
    this.curve = Curves.easeOutCubic,
  });

  final int index;
  final List<Widget> children;
  final Duration duration;
  final Curve curve;

  @override
  State<SlidingIndexedStack> createState() => _SlidingIndexedStackState();
}

class _SlidingIndexedStackState extends State<SlidingIndexedStack>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: widget.duration,
  );

  /// The page sliding *out* (the previously selected index) during a transition.
  int _outgoing = 0;

  /// Whether the incoming page enters from the right (true) or the left (false).
  bool _forward = true;

  @override
  void didUpdateWidget(SlidingIndexedStack oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.index != widget.index) {
      _outgoing = oldWidget.index;
      _forward = widget.index > oldWidget.index;
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final animating = _controller.isAnimating;
        final t = widget.curve.transform(_controller.value);
        return Stack(
          fit: StackFit.expand,
          children: [
            for (var i = 0; i < widget.children.length; i++)
              _buildChild(i, t, animating),
          ],
        );
      },
    );
  }

  Widget _buildChild(int i, double t, bool animating) {
    var offset = Offset.zero;
    bool visible;

    if (!animating) {
      visible = i == widget.index;
    } else {
      final dir = _forward ? 1.0 : -1.0;
      if (i == widget.index) {
        // Incoming: from one screen-width off the entry edge → resting position.
        visible = true;
        offset = Offset(dir * (1 - t), 0);
      } else if (i == _outgoing) {
        // Outgoing: from rest → one screen-width off the opposite edge.
        visible = true;
        offset = Offset(-dir * t, 0);
      } else {
        visible = false;
      }
    }

    // Keep the wrapper structure identical for every index on every build so the
    // child's element (and its State) is never thrown away when it toggles
    // between offstage and onstage.
    return Offstage(
      offstage: !visible,
      child: FractionalTranslation(
        translation: offset,
        child: RepaintBoundary(child: widget.children[i]),
      ),
    );
  }
}
