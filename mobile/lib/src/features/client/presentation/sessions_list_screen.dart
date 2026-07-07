import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/util/formatters.dart';
import '../../../core/widgets/glass_dock_nav_bar.dart';
import '../../../core/widgets/skeleton.dart';
import '../data/client_models.dart';
import '../data/client_repository.dart';
import '../domain/session_workout_summary.dart';
import 'widgets/client_widgets.dart';
import 'widgets/workout_history_list.dart';
import 'workout_history_screen.dart';

const _emerald = Color(0xFF10B981);

/// Newest sessions shown inline before the "View all" overflow into the full
/// history screen.
const _historyPreviewCount = 10;

final _volumeFmt = NumberFormat.decimalPattern();

/// Client Sessions — a single-scroll, session-focused timeline (no stats block;
/// Home + the Progress tab own those). It leads with a hero for the
/// active/next session, then Upcoming, then a rich Session-History feed whose
/// cards carry a muscle thumbnail + derived title + volume, all computed from
/// the workouts feed with zero backend work.
class SessionsListScreen extends ConsumerWidget {
  const SessionsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final sessions = ref.watch(clientSessionsProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () => Haptics.onRefresh(() async {
            ref.invalidate(clientSessionsProvider);
            ref.invalidate(workoutHistoryProvider);
            await ref.read(clientSessionsProvider.future);
          }),
          child: ListView(
            padding:
                EdgeInsets.fromLTRB(16, 16, 16, glassDockScrollInset(context)),
            children: [
              Text('My Sessions',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800, letterSpacing: -0.5)),
              const SizedBox(height: 4),
              Text('Your training journey with us',
                  style: TextStyle(color: scheme.onSurfaceVariant)),
              const SizedBox(height: 18),
              ...sessions.when(
                loading: () => const [
                  Shimmer(
                    child: Column(
                      children: [
                        Bone(width: double.infinity, height: 180, radius: 20),
                        SizedBox(height: 14),
                        Bone(width: double.infinity, height: 74, radius: 16),
                        SizedBox(height: 10),
                        Bone(width: double.infinity, height: 74, radius: 16),
                      ],
                    ),
                  ),
                ],
                error: (e, _) => [
                  const SizedBox(height: 24),
                  ErrorRetry(
                    message: e.toString(),
                    onRetry: () => ref.invalidate(clientSessionsProvider),
                  ),
                ],
                data: (all) => _sessionSections(context, all),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

List<Widget> _sessionSections(BuildContext context, List<SessionSummary> all) {
  final now = DateTime.now();

  SessionSummary? active;
  for (final s in all) {
    if (s.status == SessionStatus.inProgress) {
      active = s;
      break;
    }
  }

  SessionSummary? next;
  if (active == null) {
    for (final s in all) {
      if (s.status != SessionStatus.scheduled) continue;
      final start = _startDateTime(s);
      if (start != null && start.isAfter(now)) {
        next = s;
        break;
      }
    }
  }

  final hero = active ?? next;
  final upcoming = all
      .where((s) =>
          s.status == SessionStatus.scheduled &&
          s.id != next?.id &&
          (_startDateTime(s)?.isAfter(now) ?? false))
      .toList();

  return [
    if (hero != null)
      _SessionHero(session: hero, isActive: active != null)
    else
      const _EmptyHero(),
    const SizedBox(height: 22),
    if (upcoming.isNotEmpty) ...[
      _SectionLabel('Upcoming Sessions'),
      const SizedBox(height: 10),
      for (final s in upcoming) ...[
        _UpcomingCard(session: s),
        const SizedBox(height: 10),
      ],
      const SizedBox(height: 12),
    ],
    const _HistorySection(),
  ];
}

// ── Hero ──────────────────────────────────────────────────────────────────────

/// The active-or-next session hero. Orange (brand) for an upcoming session with
/// a live "Starts in …" countdown; success-green for one in progress, showing
/// the elapsed clock. The workout title / muscle art the reference design puts
/// here are intentionally omitted — a not-yet-trained session has neither.
class _SessionHero extends StatefulWidget {
  const _SessionHero({required this.session, required this.isActive});
  final SessionSummary session;
  final bool isActive;

  @override
  State<_SessionHero> createState() => _SessionHeroState();
}

class _SessionHeroState extends State<_SessionHero> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // Active → 1Hz so the elapsed clock advances; upcoming → coarse, the
    // countdown only shows minute resolution.
    _ticker = Timer.periodic(
      Duration(seconds: widget.isActive ? 1 : 30),
      (_) {
        if (mounted) setState(() {});
      },
    );
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = widget.session;
    final accent = widget.isActive ? AppColors.of(context).success : scheme.primary;
    final start = _startDateTime(s);
    final radius = BorderRadius.circular(20);

    final String big;
    String? sub;
    if (widget.isActive) {
      final started = s.startedAt;
      big = _fmtElapsed(
          started != null ? DateTime.now().difference(started) : Duration.zero);
      sub = started != null
          ? 'Started ${Fmt.time('${started.hour}:${started.minute}')}'
          : null;
    } else {
      big = Fmt.time(s.scheduledTime);
      sub = _relativeDay(s.scheduledDate);
    }

    return RepaintBoundary(
      child: Material(
        color: Colors.transparent,
        borderRadius: radius,
        child: InkWell(
          onTap: () => context.push('/client/sessions/${s.id}'),
          borderRadius: radius,
          child: Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              borderRadius: radius,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  accent.withValues(alpha: 0.22),
                  accent.withValues(alpha: 0.05),
                ],
              ),
              border: Border.all(color: accent.withValues(alpha: 0.35)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      widget.isActive ? 'SESSION IN PROGRESS' : 'NEXT SESSION',
                      style: TextStyle(
                        color: accent,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const Spacer(),
                    if (widget.isActive)
                      _livePill(accent)
                    else
                      _countdownPill(start, accent),
                  ],
                ),
                const SizedBox(height: 14),
                if (sub != null) ...[
                  Text(
                    sub,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 2),
                ],
                Text(
                  big,
                  style: TextStyle(
                    fontSize: 30,
                    height: 1.05,
                    fontWeight: FontWeight.w800,
                    fontFeatures: widget.isActive
                        ? const [FontFeature.tabularFigures()]
                        : null,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    CircleAvatar(
                      radius: 16,
                      backgroundColor: accent.withValues(alpha: 0.18),
                      child: Text(
                        _initials(s.trainerName ?? 'PT'),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: accent,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        s.trainerName != null
                            ? 'Trainer ${s.trainerName}'
                            : 'Personal Training',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(Icons.timer_outlined,
                        size: 13, color: scheme.onSurfaceVariant),
                    const SizedBox(width: 4),
                    Text('${s.durationMin} min',
                        style: TextStyle(
                            fontSize: 12, color: scheme.onSurfaceVariant)),
                  ],
                ),
                const SizedBox(height: 16),
                _HeroButton(
                  label: widget.isActive ? 'View workout' : 'View session',
                  color: accent,
                  onTap: () => context.push('/client/sessions/${s.id}'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Widget _countdownPill(DateTime? start, Color accent) {
  final label =
      start == null ? 'Scheduled' : _countdownLabel(start.difference(DateTime.now()));
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(
      color: accent.withValues(alpha: 0.14),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.schedule, size: 12, color: accent),
        const SizedBox(width: 5),
        Text(label,
            style: TextStyle(
                color: accent, fontSize: 11, fontWeight: FontWeight.w700)),
      ],
    ),
  );
}

Widget _livePill(Color accent) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
          ),
          const SizedBox(width: 5),
          Text('Live',
              style: TextStyle(
                  color: accent, fontSize: 11, fontWeight: FontWeight.w800)),
        ],
      ),
    );

class _HeroButton extends StatelessWidget {
  const _HeroButton(
      {required this.label, required this.color, required this.onTap});
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(14);
    return SizedBox(
      width: double.infinity,
      child: Material(
        color: color,
        borderRadius: radius,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(label,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 14)),
                const SizedBox(width: 6),
                const Icon(Icons.arrow_forward, size: 16, color: Colors.white),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyHero extends StatelessWidget {
  const _EmptyHero();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 18),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        children: [
          Icon(Icons.event_busy,
              size: 32, color: scheme.onSurfaceVariant.withValues(alpha: 0.5)),
          const SizedBox(height: 10),
          const Text('No upcoming sessions',
              style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(
            'New sessions appear here once your trainer schedules them.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

// ── Upcoming card ─────────────────────────────────────────────────────────────

class _UpcomingCard extends StatelessWidget {
  const _UpcomingCard({required this.session});
  final SessionSummary session;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = session;
    final radius = BorderRadius.circular(16);
    return Material(
      color: scheme.surfaceContainerLow,
      borderRadius: radius,
      child: InkWell(
        onTap: () => context.push('/client/sessions/${s.id}'),
        borderRadius: radius,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: radius,
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Row(
            children: [
              _DateBadge(date: s.scheduledDate),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _relativeDay(s.scheduledDate),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Icon(Icons.schedule,
                            size: 12, color: scheme.onSurfaceVariant),
                        const SizedBox(width: 4),
                        Text(Fmt.time(s.scheduledTime),
                            style: TextStyle(
                                fontSize: 12, color: scheme.onSurfaceVariant)),
                        const SizedBox(width: 10),
                        Text('${s.durationMin} min',
                            style: TextStyle(
                                fontSize: 12, color: scheme.onSurfaceVariant)),
                        if (s.trainerName != null) ...[
                          const SizedBox(width: 10),
                          Flexible(
                            child: Text('· ${s.trainerName}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 12,
                                    color: scheme.onSurfaceVariant)),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _StatusPill(
                  label: 'Scheduled', color: scheme.primary, icon: Icons.event),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Session history ───────────────────────────────────────────────────────────

class _HistorySection extends ConsumerWidget {
  const _HistorySection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(workoutHistoryProvider);
    final sessions = ref.watch(clientSessionsProvider).valueOrNull ?? const [];
    final durationById = {for (final s in sessions) s.id: s.durationMin};

    return history.when(
      loading: () => const Padding(
        padding: EdgeInsets.only(top: 4),
        child: Shimmer(
          child: Column(
            children: [
              Bone(width: double.infinity, height: 88, radius: 16),
              SizedBox(height: 10),
              Bone(width: double.infinity, height: 88, radius: 16),
            ],
          ),
        ),
      ),
      // History is a secondary feed; if it fails, stay quiet rather than
      // covering the (already-loaded) hero + upcoming with an error.
      error: (_, _) => const SizedBox.shrink(),
      data: (items) {
        if (items.isEmpty) return const SizedBox.shrink();
        final groups = groupWorkoutsBySession(items);
        final preview = groups.take(_historyPreviewCount).toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _SectionLabel(
              'Session History',
              trailing: groups.length > _historyPreviewCount
                  ? _ViewAll(onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                            builder: (_) => const WorkoutHistoryScreen()),
                      ))
                  : null,
            ),
            const SizedBox(height: 10),
            for (final g in preview) ...[
              _HistoryCard(
                  group: g, durationMin: durationById[g.sessionId]),
              const SizedBox(height: 10),
            ],
          ],
        );
      },
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.group, this.durationMin});
  final WorkoutSessionGroup group;
  final int? durationMin;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final radius = BorderRadius.circular(16);
    final summary =
        summarizeSession(group.entries.map((e) => e.log).toList());

    final meta = <String>[
      '${summary.exerciseCount} exercise${summary.exerciseCount == 1 ? '' : 's'}',
      if (summary.totalVolumeKg > 0)
        '${_volumeFmt.format(summary.totalVolumeKg.round())} kg',
    ];

    return Material(
      color: scheme.surfaceContainerLow,
      borderRadius: radius,
      child: InkWell(
        onTap: () => context.push('/client/sessions/${group.sessionId}'),
        borderRadius: radius,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: radius,
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Row(
            children: [
              _DateBadge(date: group.date),
              const SizedBox(width: 10),
              _MuscleThumb(asset: summary.imageAsset),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            summary.title ?? 'Workout',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 14, fontWeight: FontWeight.w700),
                          ),
                        ),
                        const SizedBox(width: 8),
                        _StatusPill(
                            label: 'Completed',
                            color: _emerald,
                            icon: Icons.check_circle),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        if (group.trainerName != null) ...[
                          Flexible(
                            child: Text(group.trainerName!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 12,
                                    color: scheme.onSurfaceVariant)),
                          ),
                          if (durationMin != null)
                            Text('  ·  ',
                                style: TextStyle(
                                    fontSize: 12,
                                    color: scheme.onSurfaceVariant)),
                        ],
                        if (durationMin != null)
                          Text('$durationMin min',
                              style: TextStyle(
                                  fontSize: 12,
                                  color: scheme.onSurfaceVariant)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      meta.join('  •  '),
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: scheme.onSurface.withValues(alpha: 0.8),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// White product-style tile for the trained muscle group's anatomical art —
/// mirrors the workout logger's leading thumbnail. Falls back to a tinted glyph
/// when the session has no recognised group.
class _MuscleThumb extends StatelessWidget {
  const _MuscleThumb({required this.asset});
  final String? asset;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    const size = 50.0;
    final radius = BorderRadius.circular(12);
    if (asset == null) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: scheme.primary.withValues(alpha: 0.12),
          borderRadius: radius,
        ),
        child: Icon(Icons.fitness_center, size: 22, color: scheme.primary),
      );
    }
    return Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: radius,
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Image.asset(asset!, fit: BoxFit.contain),
    );
  }
}

// ── Shared bits ───────────────────────────────────────────────────────────────

class _DateBadge extends StatelessWidget {
  const _DateBadge({required this.date});
  final DateTime? date;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: scheme.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            date != null ? '${date!.day}' : '—',
            style: TextStyle(
              fontSize: 16,
              height: 1,
              fontWeight: FontWeight.w800,
              color: scheme.primary,
            ),
          ),
          Text(
            date != null ? Fmt.monthShort(date!).toUpperCase() : '',
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              color: scheme.primary.withValues(alpha: 0.7),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill(
      {required this.label, required this.color, required this.icon});
  final String label;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: color),
          const SizedBox(width: 4),
          Text(label,
              style: TextStyle(
                  fontSize: 10, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text, {this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        Expanded(
          child: Text(
            text.toUpperCase(),
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  fontSize: 11,
                ),
          ),
        ),
        ?trailing,
      ],
    );
  }
}

class _ViewAll extends StatelessWidget {
  const _ViewAll({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('View all',
                style: TextStyle(color: scheme.primary, fontSize: 12)),
            Icon(Icons.chevron_right, size: 14, color: scheme.primary),
          ],
        ),
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Combine a session's `scheduledDate` (local midnight) with its "HH:MM"
/// `scheduledTime` into a single local DateTime, or null when the date is unset.
DateTime? _startDateTime(SessionSummary s) {
  final d = s.scheduledDate;
  if (d == null) return null;
  final parts = s.scheduledTime.split(':');
  final h = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0;
  final m = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return DateTime(d.year, d.month, d.day, h, m);
}

String _countdownLabel(Duration d) {
  if (d.isNegative || d.inMinutes < 1) return 'Starting now';
  final days = d.inDays;
  if (days >= 1) {
    final hrs = d.inHours % 24;
    return hrs > 0 ? 'In ${days}d ${hrs}h' : 'In ${days}d';
  }
  final h = d.inHours;
  final m = d.inMinutes % 60;
  if (h >= 1) return 'Starts in ${h}h ${m}m';
  return 'Starts in ${m}m';
}

String _relativeDay(DateTime? date) {
  if (date == null) return 'Upcoming';
  final today = DateTime.now();
  final t0 = DateTime(today.year, today.month, today.day);
  final d0 = DateTime(date.year, date.month, date.day);
  final diff = d0.difference(t0).inDays;
  if (diff == 0) return 'Today';
  if (diff == 1) return 'Tomorrow';
  if (diff == -1) return 'Yesterday';
  if (diff > 1 && diff <= 6) return 'In $diff days';
  return Fmt.dayMonth(date);
}

String _fmtElapsed(Duration d) {
  final s = d.isNegative ? Duration.zero : d;
  String two(int n) => n.toString().padLeft(2, '0');
  final h = s.inHours;
  final m = s.inMinutes % 60;
  final sec = s.inSeconds % 60;
  return h > 0 ? '$h:${two(m)}:${two(sec)}' : '${two(m)}:${two(sec)}';
}

String _initials(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts.first[0] + parts.last[0]).toUpperCase();
}
