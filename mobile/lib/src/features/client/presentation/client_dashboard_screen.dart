import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart' hide Badge;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/util/formatters.dart';
import '../../auth/application/auth_controller.dart';
import '../data/client_extras_models.dart' show Badge;
import '../data/client_models.dart';
import '../data/client_repository.dart';
import 'progress_screen.dart';
import 'widgets/client_widgets.dart';

// ── Accent palette (Tailwind 500s used by the PWA dashboard) ──────────────────
const _emerald = Color(0xFF10B981);
const _green = Color(0xFF22C55E);
const _blue = Color(0xFF3B82F6);
const _amber = Color(0xFFF59E0B);
const _violet = Color(0xFF8B5CF6);
const _orange = Color(0xFFF97316);
const _red = Color(0xFFEF4444);
const _gold = Color(0xFFFBBF24);
const _silver = Color(0xFFA1A1AA);
const _bronze = Color(0xFFC2410C);

/// Client home — mirrors the PWA `/client` dashboard section-for-section:
/// greeting, package status, active-session banner, engagement strip, fitness
/// journey (body metrics + PRs), earned badges, sessions ring, next session +
/// trainer, and the no-show warning.
class ClientDashboardScreen extends ConsumerWidget {
  const ClientDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final dashboard = ref.watch(clientDashboardProvider);
    final firstName = user?.firstName ?? 'there';

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(clientDashboardProvider);
            ref.invalidate(badgesProvider);
            await ref.read(clientDashboardProvider.future);
          },
          child: dashboard.when(
            loading: () => _GreetingScroll(
              firstName: firstName,
              children: const [
                SizedBox(height: 80),
                Center(child: CircularProgressIndicator()),
              ],
            ),
            error: (e, _) => _GreetingScroll(
              firstName: firstName,
              children: [
                const SizedBox(height: 60),
                ErrorRetry(
                  message: e.toString(),
                  onRetry: () => ref.invalidate(clientDashboardProvider),
                ),
              ],
            ),
            data: (d) => _GreetingScroll(
              firstName: firstName,
              children: [_DashboardBody(dashboard: d)],
            ),
          ),
        ),
      ),
    );
  }
}

/// A scroll view that always leads with the "Hey, {name}" greeting (so it shows
/// during load/error too), then renders [children].
class _GreetingScroll extends StatelessWidget {
  const _GreetingScroll({required this.firstName, required this.children});
  final String firstName;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        Text(
          'Hey, $firstName',
          style: Theme.of(context)
              .textTheme
              .headlineSmall
              ?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.5),
        ),
        const SizedBox(height: 4),
        Text(
          "Here's your fitness overview",
          style: Theme.of(context)
              .textTheme
              .bodyMedium
              ?.copyWith(color: scheme.onSurfaceVariant),
        ),
        const SizedBox(height: 20),
        ...children,
      ],
    );
  }
}

class _DashboardBody extends ConsumerWidget {
  const _DashboardBody({required this.dashboard});
  final ClientDashboard dashboard;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = dashboard;
    final pkg = d.packageExpiry;
    final sections = <Widget>[];

    void gap() => sections.add(const SizedBox(height: 14));

    if (pkg != null && pkg.endDate != null) {
      sections.add(_PackageCard(expiry: pkg));
      gap();
    }
    if (d.activeSession != null) {
      sections.add(_ActiveSessionBanner(session: d.activeSession!));
      gap();
    }

    final strip = _EngagementStrip(stats: d.engagementStats);
    if (strip.hasTiles) {
      sections.add(strip);
      gap();
    }

    if (d.hasFitnessJourney) {
      sections.add(_FitnessJourney(dashboard: d));
      gap();
    }

    sections.add(_BadgesShowcase());
    sections.add(const SizedBox(height: 14));

    sections.add(_SessionsCard(count: d.sessionCount));
    gap();

    sections.add(_NextSessionTrainerCard(
      next: d.nextSession,
      trainerName: d.trainerName,
      sessionsPerMonth: d.trainerSessionsPerMonth,
    ));

    if (d.sessionCount.noShow > 0) {
      gap();
      sections.add(_NoShowWarning(count: d.sessionCount.noShow));
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: sections);
  }
}

// ── Reusable card shell (rounded-2xl, card bg, subtle border) ──────────────────
class _Panel extends StatelessWidget {
  const _Panel({required this.child, this.padding = const EdgeInsets.all(16), this.onTap});
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(18),
      side: BorderSide(color: scheme.outlineVariant),
    );
    return Material(
      color: scheme.surfaceContainerLow,
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

Widget _sectionLabel(BuildContext context, String text, {Widget? trailing}) {
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

// ── Package status ────────────────────────────────────────────────────────────
class _PackageCard extends StatelessWidget {
  const _PackageCard({required this.expiry});
  final PackageExpiry expiry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final days = expiry.daysUntilExpiry;
    final urgent = !expiry.isExpired && days != null && days <= 7;
    final endLabel = expiry.endDate != null ? Fmt.dayMonthYear(expiry.endDate) : null;

    if (expiry.isExpired) {
      return Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1A1A2E), Color(0xFF16213E), Color(0xFF0F3460)],
          ),
        ),
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('🏋️', style: TextStyle(fontSize: 32)),
                _pill('PACKAGE EXPIRED', Colors.white.withValues(alpha: 0.85),
                    Colors.white.withValues(alpha: 0.12)),
              ],
            ),
            const SizedBox(height: 12),
            const Text("You've been benched!",
                style: TextStyle(
                    color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('Contact your gym admin to renew your PT package.',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 13)),
            const SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: const LinearProgressIndicator(
                value: 1,
                minHeight: 8,
                backgroundColor: Colors.white24,
                valueColor: AlwaysStoppedAnimation(Color(0xFFF97316)),
              ),
            ),
          ],
        ),
      );
    }

    final barColor = urgent ? _red : (expiry.progress >= 0.75 ? _amber : scheme.primary);
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(children: [
                Text(urgent ? '⏰' : '📦', style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 8),
                const Text('PT Package', style: TextStyle(fontWeight: FontWeight.w700)),
              ]),
              _pill(urgent ? 'Expiring soon' : 'Active', urgent ? _red : _emerald,
                  (urgent ? _red : _emerald).withValues(alpha: 0.15)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    days == 0 ? 'Today' : '$days',
                    style: TextStyle(
                      fontSize: 30,
                      height: 1,
                      fontWeight: FontWeight.w800,
                      color: urgent ? _red : scheme.onSurface,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    days == 0 ? 'expires today' : (days == 1 ? 'day left' : 'days remaining'),
                    style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
              if (endLabel != null)
                Text('Ends $endLabel',
                    style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: expiry.progress,
              minHeight: 8,
              backgroundColor: scheme.surfaceContainerHighest,
              valueColor: AlwaysStoppedAnimation(barColor),
            ),
          ),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: Text('${(expiry.progress * 100).round()}% of package used',
                style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
          ),
        ],
      ),
    );
  }
}

Widget _pill(String text, Color fg, Color bg) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(text,
          style: TextStyle(color: fg, fontSize: 10, fontWeight: FontWeight.w700)),
    );

// ── Active session hero banner ────────────────────────────────────────────────
class _ActiveSessionBanner extends StatefulWidget {
  const _ActiveSessionBanner({required this.session});
  final SessionSummary session;

  @override
  State<_ActiveSessionBanner> createState() => _ActiveSessionBannerState();
}

class _ActiveSessionBannerState extends State<_ActiveSessionBanner> {
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
    final s = widget.session;
    final started = s.startedAt;
    final elapsed =
        started != null ? DateTime.now().difference(started) : Duration.zero;
    String two(int n) => n.toString().padLeft(2, '0');
    final elapsedLabel = elapsed.inHours > 0
        ? '${elapsed.inHours}:${two(elapsed.inMinutes % 60)}:${two(elapsed.inSeconds % 60)}'
        : '${two(elapsed.inMinutes)}:${two(elapsed.inSeconds % 60)}';
    return Material(
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/client/sessions/${s.id}'),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [_green, Color(0xFF059669)],
            ),
          ),
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                          color: Colors.white, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 8),
                    Text('SESSION IN PROGRESS',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.9),
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.8,
                        )),
                  ]),
                  _pill('View workout →', Colors.white, Colors.white.withValues(alpha: 0.2)),
                ],
              ),
              const SizedBox(height: 12),
              if (s.trainerName != null)
                Text.rich(
                  TextSpan(
                    text: 'Training with ',
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.85)),
                    children: [
                      TextSpan(
                        text: s.trainerName,
                        style: const TextStyle(
                            color: Colors.white, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 14),
              Center(
                child: Text(
                  elapsedLabel,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 36,
                    fontWeight: FontWeight.w800,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Engagement strip ──────────────────────────────────────────────────────────
class _EngagementStrip extends StatelessWidget {
  _EngagementStrip({required this.stats});
  final EngagementStats stats;

  late final List<_Tile> _tiles = _build();

  bool get hasTiles => _tiles.isNotEmpty;

  List<_Tile> _build() {
    final t = <_Tile>[];
    if (stats.streak >= 2) {
      t.add(_Tile(Icons.local_fire_department, 'Streak', '${stats.streak}', 'sessions',
          _orange));
    }
    if (stats.allTimeCompleted > 0) {
      t.add(_Tile(Icons.emoji_events, 'All-time', '${stats.allTimeCompleted}',
          stats.allTimeCompleted == 1 ? 'session' : 'sessions', _violet));
    }
    final d = stats.daysSinceLastSession;
    if (d != null) {
      final fresh = d <= 3;
      t.add(_Tile(Icons.restart_alt, 'Last session', d == 0 ? 'Today' : '${d}d ago',
          null, fresh ? _emerald : _amber));
    }
    return t;
  }

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < _tiles.length; i++) ...[
            if (i > 0) const SizedBox(width: 12),
            Expanded(child: _tileCard(context, _tiles[i])),
          ],
        ],
      ),
    );
  }

  Widget _tileCard(BuildContext context, _Tile t) {
    final scheme = Theme.of(context).colorScheme;
    return _Panel(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
                color: t.color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10)),
            child: Icon(t.icon, size: 16, color: t.color),
          ),
          const SizedBox(height: 10),
          Text(t.label,
              style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
          const SizedBox(height: 2),
          Text(t.value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, height: 1)),
          if (t.sub != null)
            Text(t.sub!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class _Tile {
  _Tile(this.icon, this.label, this.value, this.sub, this.color);
  final IconData icon;
  final String label;
  final String value;
  final String? sub;
  final Color color;
}

// ── Fitness Journey (body metrics + PRs) ──────────────────────────────────────
class _FitnessJourney extends StatelessWidget {
  const _FitnessJourney({required this.dashboard});
  final ClientDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final latest = dashboard.latestProgress;
    final prev = dashboard.prevProgress;
    final metrics = <Widget>[];
    if (latest?.weightKg != null) {
      metrics.add(_MetricCard(
        icon: Icons.monitor_weight_outlined,
        color: _blue,
        label: 'Weight',
        value: latest!.weightKg!,
        unit: 'kg',
        prev: prev?.weightKg,
        lowerIsBetter: true,
      ));
    }
    if (latest?.bodyFatPercent != null) {
      metrics.add(_MetricCard(
        icon: Icons.bolt_outlined,
        color: _amber,
        label: 'Body Fat',
        value: latest!.bodyFatPercent!,
        unit: '%',
        prev: prev?.bodyFatPercent,
        lowerIsBetter: true,
      ));
    }
    if (latest?.muscleMass != null) {
      metrics.add(_MetricCard(
        icon: Icons.fitness_center,
        color: _emerald,
        label: 'Muscle Mass',
        value: latest!.muscleMass!,
        unit: 'kg',
        prev: prev?.muscleMass,
      ));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionLabel(
          context,
          'Fitness Journey',
          trailing: InkWell(
            onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ProgressScreen())),
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text('Full history',
                    style: TextStyle(color: scheme.primary, fontSize: 12)),
                Icon(Icons.chevron_right, size: 14, color: scheme.primary),
              ]),
            ),
          ),
        ),
        const SizedBox(height: 10),
        if (metrics.isNotEmpty) ...[
          if (metrics.length == 1)
            metrics.first
          else
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = 0; i < metrics.length; i++) ...[
                    if (i > 0) const SizedBox(width: 12),
                    Expanded(child: metrics[i]),
                  ],
                ],
              ),
            ),
          const SizedBox(height: 12),
        ],
        if (dashboard.prs.isNotEmpty) _PrCard(prs: dashboard.prs),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.icon,
    required this.color,
    required this.label,
    required this.value,
    required this.unit,
    this.prev,
    this.lowerIsBetter = false,
  });

  final IconData icon;
  final Color color;
  final String label;
  final double value;
  final String unit;
  final double? prev;
  final bool lowerIsBetter;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return _Panel(
      onTap: () => Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => const ProgressScreen())),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, size: 16, color: color),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(label,
                  style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
            ),
            Icon(Icons.chevron_right, size: 14, color: scheme.onSurfaceVariant.withValues(alpha: 0.5)),
          ]),
          const SizedBox(height: 12),
          Text.rich(
            TextSpan(
              text: value.toStringAsFixed(1),
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              children: [
                TextSpan(
                  text: ' $unit',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w400,
                      color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          _Delta(current: value, prev: prev, unit: unit, lowerIsBetter: lowerIsBetter),
        ],
      ),
    );
  }
}

class _Delta extends StatelessWidget {
  const _Delta({
    required this.current,
    required this.prev,
    required this.unit,
    this.lowerIsBetter = false,
  });
  final double current;
  final double? prev;
  final String unit;
  final bool lowerIsBetter;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final muted = TextStyle(fontSize: 11, color: scheme.onSurfaceVariant);
    if (prev == null) return Text('First entry', style: muted);
    final diff = current - prev!;
    if (diff.abs() < 0.01) return Text('No change', style: muted);
    final positive = lowerIsBetter ? diff < 0 : diff > 0;
    final color = positive ? _emerald : const Color(0xFFF87171);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(diff > 0 ? Icons.trending_up : Icons.trending_down, size: 12, color: color),
      const SizedBox(width: 2),
      Text('${diff > 0 ? '+' : ''}${diff.toStringAsFixed(1)}$unit',
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
    ]);
  }
}

class _PrCard extends StatelessWidget {
  const _PrCard({required this.prs});
  final List<PersonalRecord> prs;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                  color: _amber.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8)),
              child: const Icon(Icons.emoji_events, size: 15, color: _amber),
            ),
            const SizedBox(width: 8),
            const Text('Personal Records',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          ]),
          const SizedBox(height: 12),
          for (var i = 0; i < prs.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            Row(children: [
              _rankBadge(i),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(prs[i].exerciseName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    Text(prs[i].muscle,
                        style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                    color: scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(8)),
                child: Text.rich(TextSpan(
                  text: Fmt.trimNum(prs[i].maxWeightKg),
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
                  children: [
                    TextSpan(
                        text: ' kg',
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w400,
                            color: scheme.onSurfaceVariant)),
                  ],
                )),
              ),
            ]),
          ],
        ],
      ),
    );
  }

  Widget _rankBadge(int i) {
    final (bg, fg) = switch (i) {
      0 => (_gold.withValues(alpha: 0.2), _gold),
      1 => (_silver.withValues(alpha: 0.2), _silver),
      2 => (_bronze.withValues(alpha: 0.2), _bronze),
      _ => (Colors.white10, Colors.white54),
    };
    return Container(
      width: 20,
      height: 20,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
      child: Text('${i + 1}',
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: fg)),
    );
  }
}

// ── Earned badges showcase (own provider) ─────────────────────────────────────
class _BadgesShowcase extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final badges = ref.watch(badgesProvider).maybeWhen(
          data: (b) => b.earned,
          orElse: () => const <Badge>[],
        );
    if (badges.isEmpty) return const SizedBox.shrink();
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                  color: _amber.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8)),
              child: const Icon(Icons.workspace_premium, size: 15, color: _amber),
            ),
            const SizedBox(width: 8),
            const Text('Badges Earned',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(width: 8),
            _pill('${badges.length}', _amber, _amber.withValues(alpha: 0.12)),
          ]),
          const SizedBox(height: 12),
          SizedBox(
            height: 78,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: math.min(badges.length, 8),
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (_, i) {
                final b = badges[i];
                return Container(
                  width: 80,
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                  decoration: BoxDecoration(
                    color: _amber.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _amber.withValues(alpha: 0.2)),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(b.icon, style: const TextStyle(fontSize: 24)),
                      const SizedBox(height: 4),
                      Text(
                        b.name,
                        maxLines: 2,
                        textAlign: TextAlign.center,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 9, height: 1.1, color: scheme.onSurface),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ── Sessions ring + stat pills ────────────────────────────────────────────────
class _SessionsCard extends StatelessWidget {
  const _SessionsCard({required this.count});
  final SessionCount count;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final usedFrac = count.total > 0 ? count.used / count.total : 0.0;
    return _Panel(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel(context, 'Sessions',
              trailing: Text('This month',
                  style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant))),
          const SizedBox(height: 14),
          Row(children: [
            SizedBox(
              width: 96,
              height: 96,
              child: Stack(alignment: Alignment.center, children: [
                SizedBox.expand(
                  child: CircularProgressIndicator(
                    value: usedFrac,
                    strokeWidth: 8,
                    strokeCap: StrokeCap.round,
                    backgroundColor: scheme.surfaceContainerHighest,
                    valueColor: AlwaysStoppedAnimation(scheme.primary),
                  ),
                ),
                Column(mainAxisSize: MainAxisSize.min, children: [
                  Text('${count.used}',
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, height: 1)),
                  Text('of ${count.total}',
                      style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
                ]),
              ]),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(children: [
                Row(children: [
                  Expanded(child: _StatPill(Icons.fitness_center, 'Used', count.used, scheme.primary)),
                  const SizedBox(width: 10),
                  Expanded(child: _StatPill(Icons.event_available, 'Remaining', count.remaining, _emerald)),
                ]),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(child: _StatPill(Icons.adjust, 'Total', count.total, _blue)),
                  const SizedBox(width: 10),
                  Expanded(child: _StatPill(Icons.autorenew, 'Carry Fwd', count.carryForward, _amber)),
                ]),
              ]),
            ),
          ]),
        ],
      ),
    );
  }
}

class _StatPill extends StatelessWidget {
  const _StatPill(this.icon, this.label, this.value, this.color);
  final IconData icon;
  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
      decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(10)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(children: [
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8)),
              child: Icon(icon, size: 13, color: color),
            ),
            const SizedBox(width: 8),
            Text('$value',
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, height: 1)),
          ]),
          const SizedBox(height: 6),
          Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

// ── Next session + trainer (merged) ───────────────────────────────────────────
class _NextSessionTrainerCard extends StatelessWidget {
  const _NextSessionTrainerCard({
    required this.next,
    required this.trainerName,
    required this.sessionsPerMonth,
  });
  final SessionSummary? next;
  final String? trainerName;
  final int? sessionsPerMonth;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return _Panel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 8),
            child: Row(children: [
              Icon(Icons.bolt, size: 16, color: scheme.primary),
              const SizedBox(width: 6),
              Expanded(child: _sectionLabel(context, 'Next Session')),
            ]),
          ),
          if (next != null)
            InkWell(
              onTap: () => context.push('/client/sessions/${next!.id}'),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 0, 18, 16),
                child: Row(children: [
                  _dateBadge(context, next!.scheduledDate),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Text(_relativeDay(next!.scheduledDate),
                              style: const TextStyle(fontWeight: FontWeight.w700)),
                          const SizedBox(width: 8),
                          _pill('${next!.durationMin} min', scheme.primary,
                              scheme.primary.withValues(alpha: 0.12)),
                        ]),
                        const SizedBox(height: 4),
                        Row(children: [
                          Icon(Icons.schedule, size: 12, color: scheme.onSurfaceVariant),
                          const SizedBox(width: 4),
                          Text(Fmt.time(next!.scheduledTime),
                              style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
                        ]),
                      ],
                    ),
                  ),
                  Icon(Icons.arrow_forward, size: 16, color: scheme.onSurfaceVariant),
                ]),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
              child: Column(children: [
                Icon(Icons.event_busy, size: 30, color: scheme.onSurfaceVariant.withValues(alpha: 0.5)),
                const SizedBox(height: 8),
                Text('No upcoming sessions scheduled',
                    style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
              ]),
            ),
          if (trainerName != null) ...[
            Divider(height: 1, indent: 18, endIndent: 18, color: scheme.outlineVariant),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
              child: Row(children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: scheme.surfaceContainerHighest,
                  child: Text(_initials(trainerName!),
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(trainerName!,
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                      if (sessionsPerMonth != null)
                        Text('$sessionsPerMonth sessions/month',
                            style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
                    ],
                  ),
                ),
              ]),
            ),
          ],
        ],
      ),
    );
  }

  Widget _dateBadge(BuildContext context, DateTime? date) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 54,
      height: 54,
      decoration: BoxDecoration(
          color: scheme.primary.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(14)),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(date != null ? '${date.day}' : '—',
              style: TextStyle(
                  fontSize: 18, height: 1, fontWeight: FontWeight.w800, color: scheme.primary)),
          Text(date != null ? Fmt.monthShort(date).toUpperCase() : '',
              style: TextStyle(
                  fontSize: 10, fontWeight: FontWeight.w600, color: scheme.primary.withValues(alpha: 0.7))),
        ],
      ),
    );
  }
}

// ── No-show warning ───────────────────────────────────────────────────────────
class _NoShowWarning extends StatelessWidget {
  const _NoShowWarning({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _red.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _red.withValues(alpha: 0.2)),
      ),
      child: Row(children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
              color: _red.withValues(alpha: 0.15), shape: BoxShape.circle),
          child: const Icon(Icons.error_outline, size: 18, color: _red),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('$count no-show session${count > 1 ? 's' : ''}',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              Text('Counted as used this month',
                  style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
            ],
          ),
        ),
      ]),
    );
  }
}

// ── Local helpers ─────────────────────────────────────────────────────────────
String _initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts.first[0] + parts.last[0]).toUpperCase();
}

String _relativeDay(DateTime? date) {
  if (date == null) return 'Upcoming';
  final today = DateTime.now();
  final t0 = DateTime(today.year, today.month, today.day);
  final d0 = DateTime(date.year, date.month, date.day);
  final diff = d0.difference(t0).inDays;
  if (diff == 0) return 'Today';
  if (diff == 1) return 'Tomorrow';
  if (diff > 1 && diff <= 6) return 'In $diff days';
  return Fmt.dayMonth(date);
}
