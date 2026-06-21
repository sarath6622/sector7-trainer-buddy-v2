import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/util/formatters.dart';
import '../../data/trainer_models.dart';

// Dashboard accent palette — shared vocabulary with the web trainer dashboard.
const _kLive = Color(0xFF22C55E); // emerald-500 — running today
const _kAttention = Color(0xFFF59E0B); // amber-500 — never-ended cleanup
const _kUrgent = Color(0xFFFB7185); // rose-400  — overtime

/// The dashboard's "Active Sessions" card — the single home for every
/// IN_PROGRESS session, ported from the web `ActiveSessionsCard`:
///
///   • **live**  — in progress today: emerald accent + a live count-up timer,
///                 tap to resume.
///   • **stale** — in progress from a previous day (never ended): a calm
///                 neutral tile with an "Open for N days" age and an explicit
///                 amber "Resume & End Session" action.
///
/// Header + shell adapt to the mix (live-only → emerald, has-stale → neutral
/// with amber warning icon). Renders nothing when there are no active sessions.
class ActiveSessionsCard extends StatelessWidget {
  const ActiveSessionsCard({
    super.key,
    required this.live,
    required this.stale,
    required this.onOpen,
  });

  final List<TrainerSession> live;
  final List<TrainerSession> stale;
  final void Function(String sessionId) onOpen;

  @override
  Widget build(BuildContext context) {
    // Defensive de-dupe — a session must never appear in both groups.
    final staleIds = stale.map((s) => s.id).toSet();
    final liveSessions = live.where((s) => !staleIds.contains(s.id)).toList();

    final total = liveSessions.length + stale.length;
    if (total == 0) return const SizedBox.shrink();

    final scheme = Theme.of(context).colorScheme;
    final hasLive = liveSessions.isNotEmpty;
    final hasStale = stale.isNotEmpty;
    final mixed = hasLive && hasStale;
    final staleOnly = hasStale && !hasLive;
    final attention = hasStale;

    final heading = mixed
        ? 'Active Sessions'
        : hasLive
            ? (liveSessions.length == 1
                ? 'Session in progress'
                : '${liveSessions.length} sessions in progress')
            : 'Incomplete Sessions';
    final subtitle = staleOnly
        ? 'Never ended — resume to close them out.'
        : mixed
            ? 'Some were never ended — resume to close them out.'
            : liveSessions.length == 1
                ? 'Tap to jump back into your session.'
                : 'Tap any session to jump back in.';

    final headingColor = mixed
        ? scheme.onSurface
        : hasLive
            ? _kLive
            : _kAttention;

    return Container(
      decoration: BoxDecoration(
        color: hasLive && !mixed
            ? _kLive.withValues(alpha: 0.06)
            : scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: hasLive && !mixed
              ? _kLive.withValues(alpha: 0.25)
              : scheme.outlineVariant.withValues(alpha: 0.08),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: (attention ? _kAttention : _kLive)
                        .withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: attention
                      ? const Icon(Icons.warning_amber_rounded,
                          color: _kAttention, size: 22)
                      : const _PulseDot(),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        heading,
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: headingColor,
                            ),
                      ),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: scheme.onSurfaceVariant,
                            ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: attention
                        ? scheme.surfaceContainerHighest
                        : _kLive.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$total',
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: attention ? scheme.onSurfaceVariant : _kLive,
                        ),
                  ),
                ),
              ],
            ),
          ),

          // Live tiles
          for (final s in liveSessions)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: _LiveTile(session: s, onTap: () => onOpen(s.id)),
            ),

          // Stale tiles
          for (final s in stale)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: _StaleTile(session: s, onResume: () => onOpen(s.id)),
            ),
        ],
      ),
    );
  }
}

/// A live, running-today session: time block + name + "Live" line + the
/// count-up timer, tappable to resume.
class _LiveTile extends StatelessWidget {
  const _LiveTile({required this.session, required this.onTap});
  final TrainerSession session;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: _kLive.withValues(alpha: 0.06),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _kLive.withValues(alpha: 0.3)),
          ),
          child: Row(
            children: [
              _TimeBlock(
                time: session.scheduledTime,
                bg: _kLive.withValues(alpha: 0.15),
                fg: _kLive,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.clientName ?? 'Client',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        const _PulseDot(size: 7),
                        const SizedBox(width: 6),
                        Text(
                          'Live · ${session.summary.durationMin} min',
                          style:
                              Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: scheme.onSurfaceVariant,
                                  ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (session.summary.startedAt != null)
                LiveCountUp(
                  startedAt: session.summary.startedAt!,
                  expectedDurationMin: session.summary.durationMin,
                ),
              Icon(Icons.chevron_right,
                  color: _kLive.withValues(alpha: 0.7), size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

/// A never-ended session from a previous day — calm neutral tile + an amber
/// "Resume & End Session" action.
class _StaleTile extends StatelessWidget {
  const _StaleTile({required this.session, required this.onResume});
  final TrainerSession session;
  final VoidCallback onResume;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final date = session.scheduledDate;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.08)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              _TimeBlock.date(date, scheme),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.clientName ?? 'Client',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${Fmt.time(session.scheduledTime)} · ${session.summary.durationMin} min',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.timer_outlined,
                        size: 12, color: scheme.onSurfaceVariant),
                    const SizedBox(width: 4),
                    Text(
                      _openForLabel(session),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onResume,
              style: FilledButton.styleFrom(
                backgroundColor: _kAttention,
                foregroundColor: const Color(0xFF422006), // amber-950
                padding: const EdgeInsets.symmetric(vertical: 11),
              ),
              icon: const Icon(Icons.stop_rounded, size: 18),
              label: const Text('Resume & End Session',
                  style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Open for N minutes/hours/days" age for a never-ended session, measured from
/// when it actually started (falling back to its scheduled date).
String _openForLabel(TrainerSession s) {
  final ref = s.summary.startedAt ?? s.scheduledDate ?? DateTime.now();
  final mins = DateTime.now().difference(ref).inMinutes;
  if (mins < 60) {
    final m = mins < 1 ? 1 : mins;
    return 'Open for $m minute${m == 1 ? '' : 's'}';
  }
  final hrs = mins ~/ 60;
  if (hrs < 24) return 'Open for $hrs hour${hrs == 1 ? '' : 's'}';
  final days = hrs ~/ 24;
  return 'Open for $days day${days == 1 ? '' : 's'}';
}

/// Live elapsed timer that ticks every second, mirroring the web `InlineTimer`.
/// Counts up from [startedAt]; flips to the urgent colour once it passes the
/// expected duration.
class LiveCountUp extends StatefulWidget {
  const LiveCountUp({
    super.key,
    required this.startedAt,
    required this.expectedDurationMin,
  });

  final DateTime startedAt;
  final int expectedDurationMin;

  @override
  State<LiveCountUp> createState() => _LiveCountUpState();
}

class _LiveCountUpState extends State<LiveCountUp> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final elapsedSec =
        DateTime.now().difference(widget.startedAt).inSeconds.clamp(0, 1 << 40);
    final overtime = widget.expectedDurationMin > 0 &&
        elapsedSec >= widget.expectedDurationMin * 60;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Text(
        _fmt(elapsedSec),
        style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: overtime ? _kUrgent : scheme.primary,
              fontWeight: FontWeight.w800,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
      ),
    );
  }

  static String _fmt(int totalSec) {
    String two(int n) => n.toString().padLeft(2, '0');
    final h = totalSec ~/ 3600;
    final m = (totalSec % 3600) ~/ 60;
    final s = totalSec % 60;
    return h > 0 ? '$h:${two(m)}:${two(s)}' : '${two(m)}:${two(s)}';
  }
}

/// A small "HH:MM / AM" stacked time block, or a "DD / MON" date block.
class _TimeBlock extends StatelessWidget {
  const _TimeBlock({required this.time, required this.bg, required this.fg})
      : _topText = null,
        _bottomText = null;

  const _TimeBlock._raw({
    required String top,
    required String bottom,
    required this.bg,
    required this.fg,
  })  : _topText = top,
        _bottomText = bottom,
        time = null;

  factory _TimeBlock.date(DateTime? date, ColorScheme scheme) {
    final d = date ?? DateTime.now();
    const months = [
      'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', //
      'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
    ];
    return _TimeBlock._raw(
      top: '${d.day}',
      bottom: months[d.month - 1],
      bg: scheme.surfaceContainerHighest,
      fg: scheme.onSurface,
    );
  }

  final String? time;
  final String? _topText;
  final String? _bottomText;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    String top;
    String bottom;
    if (time != null) {
      final parts = Fmt.time(time!).split(' ');
      top = parts.isNotEmpty ? parts[0] : time!;
      bottom = parts.length > 1 ? parts[1] : '';
    } else {
      top = _topText ?? '';
      bottom = _bottomText ?? '';
    }
    return Container(
      width: 56,
      height: 48,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            top,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: fg,
                  fontWeight: FontWeight.w800,
                  height: 1,
                ),
          ),
          if (bottom.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              bottom,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: fg.withValues(alpha: 0.75),
                    fontWeight: FontWeight.w700,
                    fontSize: 9,
                    letterSpacing: 0.4,
                  ),
            ),
          ],
        ],
      ),
    );
  }
}

/// A small pulsing "live" dot.
class _PulseDot extends StatefulWidget {
  const _PulseDot({this.size = 10});
  final double size;

  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          AnimatedBuilder(
            animation: _c,
            builder: (_, _) => Opacity(
              opacity: (1 - _c.value) * 0.7,
              child: Transform.scale(
                scale: 1 + _c.value * 1.6,
                child: Container(
                  decoration: const BoxDecoration(
                    color: _kLive,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ),
          ),
          Container(
            width: widget.size,
            height: widget.size,
            decoration: const BoxDecoration(
              color: _kLive,
              shape: BoxShape.circle,
            ),
          ),
        ],
      ),
    );
  }
}
