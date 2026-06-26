import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Animated cold-start splash — a Flutter port of the PWA's `SplashScreen.tsx`.
///
/// The six wordmark letters (S E C T O R) rise in with a stagger, then the `T`
/// swaps out and the brand `7` slams into its place with an overshoot + a short
/// screen shake, and finally the FITNESS / GYM CROSSFIT taglines pop in. Shown
/// while [AuthController] restores a session on cold start; the router redirects
/// away (with a fade) once auth resolves — see [AuthController]'s minimum-splash
/// floor which keeps this on screen for one full play even when restore is
/// instant.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  // ── Timeline (ms) — mirrors the constants in SplashScreen.tsx ──────────────
  static const int _stagger = 70;
  static const int _letterDur = 360;
  static const int _revealDone = 5 * _stagger + _letterDur; // 710
  static const int _swapStart = _revealDone + 520; // 1230
  static const int _swapOutDur = 200;
  static const int _swapInDelay = _swapStart + 90; // 1320
  static const int _swapInDur = 320;
  static const int _impact = _swapInDelay + _swapInDur; // 1640
  static const int _shakeDur = 300;
  static const int _taglineDelay = _impact + 180; // 1820
  static const int _taglineDur = 340;
  static const int _gymDelay = _taglineDelay + 80; // 1900
  static const int _total = 2600;

  // ── Sizing (logical px) ────────────────────────────────────────────────────
  static const double _letterH = 42; // each square glyph cell
  static const double _heroH = 94; // the 7 punches out larger than the row
  static const double _fitnessH = 12;
  static const double _gymH = 13;

  static const _orange = Color(0xFFE8652C); // matches the 7's glow in the PWA

  // S E C [T→7] O R
  static const _letters = ['s', 'e', 'c', 't', 'o', 'r'];
  static const int _tIndex = 3;

  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: _total),
    )..forward();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  /// Eased 0→1 progress for a [startMs]..[startMs + durMs] window of the
  /// timeline, given the controller's current position.
  double _phase(int startMs, int durMs, {Curve curve = Curves.linear}) {
    final nowMs = _c.value * _total;
    final t = ((nowMs - startMs) / durMs).clamp(0.0, 1.0);
    return curve.transform(t);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      body: Center(
        child: AnimatedBuilder(
          animation: _c,
          builder: (context, _) {
            // Screen shake — a decaying jitter that peaks mid-window and
            // resolves to zero at both ends (so it's inert before impact).
            final shake = _phase(_impact, _shakeDur);
            final env = math.sin(shake * math.pi); // 0 → 1 → 0 envelope
            final dx = math.sin(shake * math.pi * 6) * env * 4;
            final dy = math.cos(shake * math.pi * 5) * env * 3;
            final angle = math.sin(shake * math.pi * 4) * env * 0.015;

            return Transform.translate(
              offset: Offset(dx, dy),
              child: Transform.rotate(
                angle: angle,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Wordmark + FITNESS, right-aligned as a group (FITNESS sits
                    // under the right edge of the wordmark, like the logo).
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        _buildWordmark(),
                        const SizedBox(height: 6),
                        _buildTagline(
                          asset: 'assets/splash/fitness.png',
                          height: _fitnessH,
                          opacity: 0.75,
                          startMs: _taglineDelay,
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    _buildTagline(
                      asset: 'assets/splash/gym-crossfit.png',
                      height: _gymH,
                      opacity: 0.6,
                      startMs: _gymDelay,
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildWordmark() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < _letters.length; i++)
          if (i == _tIndex) _buildTtoSeven() else _buildLetter(i),
      ],
    );
  }

  /// A plain wordmark letter that rises up + fades to 0.85 with a stagger.
  Widget _buildLetter(int i) {
    final rise = _phase(i * _stagger, _letterDur, curve: _riseCurve);
    return Opacity(
      opacity: rise * 0.85,
      child: Transform.translate(
        offset: Offset(0, (1 - rise) * 14),
        child: Image.asset(
          'assets/splash/${_letters[i]}.png',
          height: _letterH,
          width: _letterH,
        ),
      ),
    );
  }

  /// The signature moment: the `T` rises like the others then scales/fades out
  /// while the oversized `7` slams down into the same slot with an overshoot
  /// and an orange glow, overflowing its cell without shifting the neighbours.
  Widget _buildTtoSeven() {
    final rise = _phase(_tIndex * _stagger, _letterDur, curve: _riseCurve);
    final out = _phase(_swapStart, _swapOutDur, curve: Curves.easeIn);

    // 7 slam-in: opacity ramps over the first 80%; scale 1.5→1.0 and
    // translateY -30→0 ride an overshoot curve for the heavy "dip + settle".
    final inRaw = _phase(_swapInDelay, _swapInDur);
    final inOpacity = (inRaw / 0.8).clamp(0.0, 1.0);
    final inPop = Curves.easeOutBack.transform(inRaw);
    final sevenScale = ui.lerpDouble(1.5, 1.0, inPop)!;
    final sevenDy = ui.lerpDouble(-30, 0, inPop)!;

    return SizedBox(
      width: _letterH,
      height: _letterH,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          // T — in flow, rises then shrinks/fades away.
          Opacity(
            opacity: rise * 0.85 * (1 - out),
            child: Transform.translate(
              offset: Offset(0, (1 - rise) * 14 + out * 10),
              child: Transform.scale(
                scale: 1 - out * 0.5,
                child: Image.asset(
                  'assets/splash/t.png',
                  height: _letterH,
                  width: _letterH,
                ),
              ),
            ),
          ),
          // 7 — centred over the T slot, overflows the cell, glows orange.
          Opacity(
            opacity: inOpacity,
            child: Transform.translate(
              offset: Offset(0, sevenDy),
              child: Transform.scale(
                scale: sevenScale,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    ImageFiltered(
                      imageFilter: ui.ImageFilter.blur(
                        sigmaX: 12,
                        sigmaY: 12,
                      ),
                      child: Image.asset(
                        'assets/splash/7.png',
                        height: _heroH,
                        color: _orange.withValues(alpha: 0.7),
                        colorBlendMode: BlendMode.srcIn,
                      ),
                    ),
                    Image.asset('assets/splash/7.png', height: _heroH),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// A tagline image (white-tinted) that pops up from below with an overshoot.
  Widget _buildTagline({
    required String asset,
    required double height,
    required double opacity,
    required int startMs,
  }) {
    final show = _phase(startMs, _taglineDur, curve: Curves.easeOut);
    final pop = _phase(startMs, _taglineDur, curve: Curves.easeOutBack);
    return Opacity(
      opacity: show * opacity,
      child: Transform.translate(
        offset: Offset(0, (1 - pop) * 12),
        child: Image.asset(
          asset,
          height: height,
          color: Colors.white,
          colorBlendMode: BlendMode.srcIn,
        ),
      ),
    );
  }

  // PWA letters ease in on cubic-bezier(0.22, 1, 0.36, 1) — a strong ease-out.
  static const Cubic _riseCurve = Cubic(0.22, 1, 0.36, 1);
}
