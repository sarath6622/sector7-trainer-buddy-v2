import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/feedback/sound_service.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/skeleton.dart';
import '../../auth/application/auth_controller.dart';
import '../../client/data/client_repository.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../../session/presentation/session_live_controls.dart' show RestTimerSheet;
import '../../trainer/data/trainer_repository.dart';
import '../data/exercise.dart';
import '../data/local/local_providers.dart';
import '../data/local/workout_local_store.dart';
import '../data/muscle_groups.dart';
import '../data/workout_repository.dart';
import '../data/workout_sync_service.dart';
import '../domain/save_payload.dart';
import '../domain/workout_draft.dart';
import 'exercise_picker_sheet.dart';
import 'exercise_progress_sheet.dart';

/// Shared workout logger (ADR-036), embedded directly inside the session detail
/// screen for both the trainer and the client (no separate "Log workout" route).
/// Offline-first: edits save to the local store immediately and a scoped diff
/// (ADR-041) flushes to `POST /api/sessions/[id]/workouts` when connectivity
/// allows ([WorkoutSyncService]). On open it restores an unsynced local draft if
/// one exists, otherwise seeds from the server session detail.
///
/// The UI mirrors the PWA logger: collapsible per-exercise cards (one open at a
/// time, completed sorted to the bottom) and an add row offering Search /
/// By Muscle / Suggestions.
///
/// [header] is rendered as the first item in the scroll view (the session card +
/// lifecycle actions) so it scrolls away as the log grows. Saving stays an
/// explicit action: the host's app bar calls [WorkoutLoggerBodyState.save] via a
/// [GlobalKey], and [onSavingChanged] lets it reflect the in-flight state.
class WorkoutLoggerBody extends ConsumerStatefulWidget {
  const WorkoutLoggerBody({
    super.key,
    required this.sessionId,
    this.header,
    this.onSavingChanged,
    this.onTitleChanged,
  });

  final String sessionId;
  final Widget? header;
  final ValueChanged<bool>? onSavingChanged;

  /// Reports the focus-derived workout name (e.g. "Chest Day", or "Workout"
  /// before anything is logged) so the host app bar can title the session by the
  /// muscle groups being trained today.
  final ValueChanged<String>? onTitleChanged;

  @override
  ConsumerState<WorkoutLoggerBody> createState() => WorkoutLoggerBodyState();
}

class WorkoutLoggerBodyState extends ConsumerState<WorkoutLoggerBody> {
  List<DraftExercise>? _drafts;
  Object? _seedError;
  bool _saving = false;

  /// Last-synced snapshot the scoped diff is computed against. Seeded from the
  /// server (or a restored local draft) and advanced on a confirmed sync.
  List<Map<String, dynamic>> _baseline = const [];

  /// The saveable payload as last *persisted to the local store* — set on seed
  /// and after every save (which writes local-first). [isDirty] compares the
  /// live draft to this, so it reports true only for in-memory edits that would
  /// be lost if the logger were torn down before saving (an unsynced save is
  /// restored on remount, so it doesn't count as dirty).
  List<Map<String, dynamic>> _savedPayload = const [];

  /// Outcome of the most recent save — drives the offline / queued banner.
  SyncOutcome? _lastOutcome;

  /// True when we re-opened into edits that hadn't reached the server yet.
  bool _restoredUnsynced = false;

  /// The session's ClientProfile id, when the server exposes it — drives the
  /// "last time" hint fetch. Null on a restored offline draft (not stored).
  String? _clientProfileId;

  /// Prior-session sets per exerciseId (most recent), for placeholder hints.
  /// A present-but-empty list means "fetched, nothing prior".
  final Map<String, List<LastSetSnapshot>> _lastSets = {};

  /// Which card is expanded — only one at a time (keyed by exerciseId, unique
  /// within a workout since adds de-dupe).
  String? _expandedExerciseId;

  @override
  void initState() {
    super.initState();
    _seed();
  }

  Future<void> _seed() async {
    setState(() => _seedError = null);

    // An unsynced local draft is the freshest truth — restore it verbatim so a
    // server poll can't clobber edits made offline.
    final local =
        await ref.read(workoutDraftStoreProvider).getDraft(widget.sessionId);
    if (local != null && local.syncStatus != WorkoutSyncStatus.synced) {
      setState(() {
        _drafts = decodeDrafts(local.draftJson);
        _baseline = decodeSavePayload(local.baselineJson);
        _savedPayload = buildSavePayload(_drafts!);
        _restoredUnsynced = true;
        _lastOutcome = local.syncStatus == WorkoutSyncStatus.failed
            ? SyncOutcome.failed
            : SyncOutcome.queuedOffline;
        _expandedExerciseId = _defaultExpanded(_drafts!);
      });
      _emitTitle();
      return;
    }

    try {
      // The shared logger seeds from whichever session-detail endpoint the
      // caller is authorized for: trainers hit /api/trainer/sessions/[id],
      // clients hit /api/client/sessions/[id]. Both return the same
      // SessionDetail shape; the save path is the shared route either way.
      final user = ref.read(authControllerProvider).user;
      final detail = user != null && user.isTrainer
          ? await ref.read(trainerSessionProvider(widget.sessionId).future)
          : await ref.read(clientSessionProvider(widget.sessionId).future);
      final drafts = detail.workoutLogs.map(DraftExercise.fromLog).toList();
      final baseline = buildSavePayload(drafts);

      // Anchor the local record to the server truth at open time. This keeps a
      // later save diffing against the *current* server state (not a stale
      // baseline from a prior session) and caches the session so it stays
      // editable if connectivity drops mid-edit. Only reached when there's no
      // unsynced local draft (those are restored above and never overwritten).
      final now = DateTime.now();
      await ref.read(workoutDraftStoreProvider).putDraft(WorkoutDraftRecord(
            sessionId: widget.sessionId,
            draftJson: encodeDrafts(drafts),
            baselineJson: jsonEncode(baseline),
            syncStatus: WorkoutSyncStatus.synced,
            updatedAt: now,
            lastSyncedAt: now,
          ));

      setState(() {
        _drafts = drafts;
        _baseline = baseline; // server state = our baseline
        _savedPayload = baseline; // and what the local cache now holds
        _restoredUnsynced = false;
        _lastOutcome = null;
        _clientProfileId = detail.clientProfileId;
        _expandedExerciseId = _defaultExpanded(drafts);
      });
      _emitTitle();
      _loadLastSets();
    } catch (e) {
      // Offline with a previously-synced local copy → open it read-for-edit.
      if (local != null) {
        setState(() {
          _drafts = decodeDrafts(local.draftJson);
          _baseline = decodeSavePayload(local.baselineJson);
          _savedPayload = buildSavePayload(_drafts!);
          _expandedExerciseId = _defaultExpanded(_drafts!);
        });
        _emitTitle();
      } else {
        setState(() => _seedError = e);
      }
    }
  }

  /// Default open card: the last incomplete exercise, else nothing.
  String? _defaultExpanded(List<DraftExercise> drafts) {
    for (final d in drafts.reversed) {
      if (!d.isCompleted) return d.exerciseId;
    }
    return null;
  }

  /// Pull prior-session sets for any exercise we don't already have hints for.
  /// Best-effort and trainer-scoped — silently skipped when there's no client
  /// profile id (e.g. restored offline) or the request fails.
  Future<void> _loadLastSets() async {
    final cid = _clientProfileId;
    final drafts = _drafts;
    if (cid == null || drafts == null) return;
    final ids = drafts
        .map((d) => d.exerciseId)
        .where((id) => !_lastSets.containsKey(id))
        .toSet()
        .toList();
    if (ids.isEmpty) return;
    final fetched = await ref.read(workoutRepositoryProvider).lastSetsByExercise(
          clientProfileId: cid,
          exerciseIds: ids,
          excludeSessionId: widget.sessionId,
        );
    if (!mounted) return;
    setState(() {
      for (final id in ids) {
        final last = fetched[id] ?? const <LastSetSnapshot>[];
        _lastSets[id] = last;
        // Pre-seed the plan: a freshly-added exercise (one untouched set) opens at
        // "0 of N", matching how many sets were logged last time.
        if (last.length > 1) {
          for (final d in drafts) {
            if (d.exerciseId != id) continue;
            final fresh = d.sets.length == 1 &&
                !d.sets.first.hasValue &&
                !d.sets.first.isCompleted;
            if (fresh) {
              while (d.sets.length < last.length) {
                d.addSet();
              }
            }
          }
        }
      }
    });
  }

  // ── List mutations ─────────────────────────────────────────────────────────

  /// Stable partition: incomplete exercises first (in order), then completed.
  void _reorderCompleted() {
    final list = _drafts!;
    final incomplete = [for (final d in list) if (!d.isCompleted) d];
    final completed = [for (final d in list) if (d.isCompleted) d];
    _drafts = [...incomplete, ...completed];
  }

  Future<void> _openPicker(ExercisePickerMode mode) async {
    final picked = await showExercisePicker(
      context,
      mode: mode,
      focusGroupIds: _focusGroupIds(),
    );
    if (picked == null || picked.isEmpty || !mounted) return;

    final existing = _drafts!.map((d) => d.exerciseId).toSet();
    final fresh = picked.where((e) => !existing.contains(e.id)).toList();
    final skipped = picked.length - fresh.length;
    if (fresh.isEmpty) {
      _toast('Already in this workout.');
      return;
    }
    setState(() {
      for (final ex in fresh) {
        _drafts!.add(DraftExercise.fromExercise(ex));
      }
      _reorderCompleted();
      _expandedExerciseId = fresh.last.id;
    });
    if (skipped > 0) {
      _toast('Added ${fresh.length}, skipped $skipped already in workout.');
    }
    _emitTitle();
    _loadLastSets();
  }

  /// Curated groups inferred from what's already logged — seeds Suggestions.
  Set<String> _focusGroupIds() {
    final ids = <String>{};
    for (final d in _drafts ?? const <DraftExercise>[]) {
      final mg = d.muscleGroup;
      final g = mg == null ? null : curatedGroupOf(mg);
      if (g != null) ids.add(g);
    }
    return ids;
  }

  /// The workout name derived from today's exercises — "{Group} Day" for a single
  /// focus, the two combined for two, "Full Body Day" beyond that, and a generic
  /// "Workout" before anything is chosen. Surfaced as the host app-bar title.
  String _workoutTitle() {
    final focusSet = _focusGroupIds();
    final focus = [
      for (final id in allCuratedGroupIds)
        if (focusSet.contains(id)) curatedGroupById[id]?.label ?? id,
    ];
    if (focus.isEmpty) return 'Workout';
    if (focus.length == 1) return '${focus.first} Day';
    if (focus.length == 2) return '${focus[0]} & ${focus[1]} Day';
    return 'Full Body Day';
  }

  /// Last title pushed to the host — guards against redundant app-bar rebuilds
  /// (and lets [build] re-emit every frame without churn).
  String? _lastEmittedTitle;

  void _emitTitle() {
    final t = _workoutTitle();
    if (t == _lastEmittedTitle) return;
    _lastEmittedTitle = t;
    widget.onTitleChanged?.call(t);
  }

  void _toggleExpand(String exerciseId) {
    setState(() {
      _expandedExerciseId = _expandedExerciseId == exerciseId ? null : exerciseId;
    });
  }

  void _toggleComplete(DraftExercise d) {
    setState(() {
      d.isCompleted = !d.isCompleted;
      _reorderCompleted();
      if (d.isCompleted) {
        // Advance to the next incomplete card so logging flows top-to-bottom.
        _expandedExerciseId = _defaultExpandedForward(_drafts!);
      } else {
        _expandedExerciseId = d.exerciseId;
      }
    });
    // Reward finishing an exercise with a success buzz + the completion chime;
    // un-completing it is just a light tap (no celebration).
    if (d.isCompleted) {
      Haptics.success();
      SoundService.instance.playComplete();
    } else {
      Haptics.tap();
    }
  }

  /// First incomplete exercise (used when auto-advancing after mark-complete).
  String? _defaultExpandedForward(List<DraftExercise> drafts) {
    for (final d in drafts) {
      if (!d.isCompleted) return d.exerciseId;
    }
    return null;
  }

  void _removeExercise(DraftExercise d) {
    setState(() {
      _drafts!.remove(d);
      if (_expandedExerciseId == d.exerciseId) _expandedExerciseId = null;
    });
    _emitTitle();
  }

  /// Whether the in-memory draft holds edits the last sync hasn't captured.
  /// Public so a host that swaps this logger out (e.g. the trainer's active-
  /// session switcher) can warn before discarding. False until seeded, and
  /// false once a save advances the baseline to match.
  bool get isDirty {
    final drafts = _drafts;
    if (drafts == null) return false;
    return !diffExercises(_savedPayload, buildSavePayload(drafts)).isEmpty;
  }

  /// Persist the workout. Public so the host session screen's app-bar Save can
  /// trigger it via a [GlobalKey]. Stays mounted on success (the logger is now
  /// embedded, not a pushed route): we just refresh the session providers and
  /// toast, rather than popping.
  Future<void> save() async {
    if (_drafts == null || _saving) return;
    final drafts = _drafts!;
    // Snapshot the saveable state we're about to persist (local-first) so the
    // dirty check settles to "clean" once the save returns — whatever the sync
    // outcome, this is now what the local store holds and a remount restores.
    final persisted = buildSavePayload(drafts);
    setState(() => _saving = true);
    widget.onSavingChanged?.call(true);

    SyncOutcome outcome;
    try {
      outcome = await ref.read(workoutSyncServiceProvider).saveLocalAndSync(
            widget.sessionId,
            drafts: drafts,
            baseline: _baseline,
          );
    } catch (e) {
      outcome = SyncOutcome.failed;
      _toast(e is ApiException ? e.message : 'Could not save workout.');
    } finally {
      if (mounted) setState(() => _saving = false);
      widget.onSavingChanged?.call(false);
    }

    if (!mounted) return;
    if (outcome != SyncOutcome.noop) _savedPayload = persisted;
    switch (outcome) {
      case SyncOutcome.synced:
        Haptics.success();
        // Refresh both session readers (only the relevant one is mounted) plus
        // the client's history list, then settle in place.
        ref.invalidate(trainerSessionProvider(widget.sessionId));
        ref.invalidate(clientSessionProvider(widget.sessionId));
        ref.invalidate(workoutHistoryProvider);
        setState(() {
          _lastOutcome = null;
          _restoredUnsynced = false;
        });
        _toast('Workout saved');
      case SyncOutcome.queuedOffline:
        Haptics.tap();
        setState(() {
          _lastOutcome = outcome;
          _restoredUnsynced = true;
        });
        _toast('Saved on this device — will sync when back online.');
      case SyncOutcome.failed:
        Haptics.error();
        setState(() => _lastOutcome = outcome);
        _toast('Saved on device, but the server rejected the sync.');
      case SyncOutcome.noop:
        break;
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  // ── Build ────────────────────────────────────────────────────────────────
  //
  // No Scaffold/AppBar — this is embedded in the session detail screen, which
  // owns the app bar (with Save) and the surrounding chrome. The [header] (the
  // session card + lifecycle actions) is the first scrollable item so it scrolls
  // away as the log grows; the add row stays pinned to the bottom.

  @override
  Widget build(BuildContext context) {
    final drafts = _drafts;

    // Keep the host app-bar title named after today's focus on every build —
    // covers seed, add/remove, AND hot reload (which doesn't re-run _seed).
    // Guarded inside _emitTitle so it only fires the callback on a real change.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _emitTitle();
    });

    final Widget logContent;
    if (_seedError != null) {
      logContent = Padding(
        padding: const EdgeInsets.only(top: 48),
        child: ErrorRetry(message: _seedError.toString(), onRetry: _seed),
      );
    } else if (drafts == null) {
      logContent = const Padding(
        padding: EdgeInsets.only(top: 16),
        child: Shimmer(
          child: Column(
            children: [
              Bone(width: double.infinity, height: 96, radius: 14),
              SizedBox(height: 12),
              Bone(width: double.infinity, height: 96, radius: 14),
              SizedBox(height: 12),
              Bone(width: double.infinity, height: 96, radius: 14),
            ],
          ),
        ),
      );
    } else if (drafts.isEmpty) {
      logContent = const Padding(
        padding: EdgeInsets.only(top: 16),
        child: EmptyState(
          icon: Icons.fitness_center,
          message: 'No exercises yet.\nTap + to add one.',
        ),
      );
    } else {
      // The last-synced server snapshot, indexed by exercise — drives each row's
      // "saved to the DB" green border.
      final baselineByExercise = <String, List<Map<String, dynamic>>>{
        for (final e in _baseline)
          e['exerciseId'] as String: [
            for (final s in (e['sets'] as List)) Map<String, dynamic>.from(s as Map),
          ],
      };
      logContent = Column(
        children: [
          for (final (i, d) in drafts.indexed)
            _ExerciseCard(
              key: ValueKey(d.exerciseId),
              draft: d,
              position: i + 1,
              expanded: _expandedExerciseId == d.exerciseId,
              lastSets: _lastSets[d.exerciseId],
              clientProfileId: _clientProfileId,
              sessionId: widget.sessionId,
              baselineSets: baselineByExercise[d.exerciseId] ?? const [],
              onToggleExpand: () => _toggleExpand(d.exerciseId),
              onToggleComplete: () => _toggleComplete(d),
              onRemove: () => _removeExercise(d),
              onChanged: () => setState(() {}),
            ),
        ],
      );
    }

    return Column(
      children: [
        ?_syncBanner,
        Expanded(
          child: ListView(
            // Cards inset from the screen edges so their rounded corners read
            // cleanly. Extra bottom inset so the floating + button never covers
            // the last card's actions.
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 88),
            children: [
              ?widget.header,
              if (widget.header != null) const SizedBox(height: 12),
              logContent,
            ],
          ),
        ),
      ],
    );
  }

  /// Public entry point for the host's "+" FAB — opens the exercise search
  /// (the only add path now; By Muscle / Suggestions were dropped).
  void openSearchPicker() => _openPicker(ExercisePickerMode.search);

  /// A thin status strip shown while the workout is held on-device — either
  /// restored from an earlier offline save, queued for sync, or rejected.
  Widget? get _syncBanner {
    if (!_restoredUnsynced && _lastOutcome != SyncOutcome.failed) return null;
    final failed = _lastOutcome == SyncOutcome.failed;
    final scheme = Theme.of(context).colorScheme;
    final color = failed ? scheme.errorContainer : scheme.secondaryContainer;
    final onColor = failed ? scheme.onErrorContainer : scheme.onSecondaryContainer;
    return Container(
      width: double.infinity,
      color: color,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      child: Row(
        children: [
          Icon(failed ? Icons.sync_problem : Icons.cloud_off, size: 18, color: onColor),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              failed
                  ? 'Saved on device — last sync was rejected. It will retry.'
                  : 'Saved on device — waiting to sync.',
              style: TextStyle(color: onColor, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Exercise type styling ─────────────────────────────────────────────────
// The exercise *type* sets the circle glyph; the *muscle group* sets the circle
// colour (see _groupColor). State colour stays distinct: a completed card swaps
// the whole circle for a green check, so the group tint only ever shows on an
// in-progress card and never collides with the "done" signal.

IconData _typeIcon(String type) {
  switch (type) {
    case 'BODYWEIGHT':
      return Icons.accessibility_new;
    case 'DURATION':
      return Icons.timer_outlined;
    case 'CARDIO':
      return Icons.directions_run;
    default:
      return Icons.sports_gymnastics;
  }
}

/// A lively per-muscle-group tint for the active exercise circle, so a workout
/// reads as a colourful ordered list. Keyed by curated group id ([curatedGroupOf]);
/// greens are deliberately omitted so the tint never reads as the "completed"
/// (success-green) state.
const Map<String, Color> _groupColors = {
  'chest': Color(0xFFEF4444), // red
  'back': Color(0xFF3B82F6), // blue
  'shoulders': Color(0xFFF59E0B), // amber
  'biceps': Color(0xFF8B5CF6), // violet
  'triceps': Color(0xFF14B8A6), // teal
  'legs': Color(0xFFEC4899), // pink
  'core': Color(0xFF06B6D4), // cyan
  'fullbody': Color(0xFF6366F1), // indigo
};

/// The circle colour for an exercise — its muscle group's tint, falling back to
/// the brand accent when the group is unknown / unset.
Color _groupColor(DraftExercise d, ColorScheme scheme) {
  final mg = d.muscleGroup;
  final id = mg == null ? null : curatedGroupOf(mg);
  return (id == null ? null : _groupColors[id]) ?? scheme.primary;
}

/// The bundled anatomical asset for an exercise's muscle group, or null when
/// there isn't one yet. Art map lives in [curatedGroupImages] (shared with the
/// Session-History thumbnails); a group with no asset falls back to the tinted
/// circle + type glyph ([_leadingArt]).
String? _groupImage(DraftExercise d) => muscleGroupImageAsset(d.muscleGroup);

String _fmtNum(double v) => v % 1 == 0 ? v.toInt().toString() : v.toString();

/// "Saved to the server" accent — a value cell gains a small padded border in
/// this green once its set matches the last-synced baseline (persisted in the DB).
const Color _kSavedGreen = Color(0xFF34D399);

// The completed-exercise accent (filled check, "Completed" badge, volume summary)
// uses the design-system success colour, resolved theme-aware via AppColors in
// _completedHeader.

/// Per-row "is this set currently persisted on the server?" flags, derived by
/// consuming the exercise's baseline sets as a multiset (so duplicate rows and a
/// brand-new copy of an existing set resolve correctly by position-independent
/// value match). A set is "saved" when its saveable value signature appears in
/// the last-synced baseline; editing any field drops the match until the next save.
List<bool> _computeSavedFlags(
  List<DraftSet> sets,
  List<Map<String, dynamic>> baselineSets,
) {
  String sig(Map<String, dynamic> m) =>
      jsonEncode(Map<String, dynamic>.from(m)..remove('setNumber'));
  final counts = <String, int>{};
  for (final s in baselineSets) {
    final k = sig(s);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  final flags = <bool>[];
  for (final set in sets) {
    if (!isSaveableSet(set)) {
      flags.add(false);
      continue;
    }
    final k = sig(set.toJson());
    final c = counts[k] ?? 0;
    if (c > 0) {
      counts[k] = c - 1;
      flags.add(true);
    } else {
      flags.add(false);
    }
  }
  return flags;
}

// ─── Small UI atoms ─────────────────────────────────────────────────────────

class _Pill extends StatelessWidget {
  const _Pill({required this.text, required this.tone});
  final String text;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: tone),
      ),
    );
  }
}

// ─── Set table model ───────────────────────────────────────────────────────

/// One editable metric in a set row. Drives both the column header and the cell.
/// `rest` is optional metadata (seconds before the next set) — it never gates a
/// set's completeness, and its cell stays neutral rather than greening.
enum _Field { weight, reps, sec, rest, steps }

class _WorkCol {
  const _WorkCol(this.field, this.label, {this.decimal = false});
  final _Field field;
  final String label;
  final bool decimal;
}

/// The work columns for an exercise type (the metrics the trainer types).
/// Every strength type carries a REST column (matching the web logger); CARDIO
/// tracks duration (+ STEPS for step-tracked machines) instead.
List<_WorkCol> _workCols(String type, bool tracksSteps) {
  switch (type) {
    case 'BODYWEIGHT':
      return const [_WorkCol(_Field.reps, 'REPS'), _WorkCol(_Field.rest, 'REST')];
    case 'DURATION':
      return const [_WorkCol(_Field.sec, 'SEC'), _WorkCol(_Field.rest, 'REST')];
    case 'CARDIO':
      return [
        const _WorkCol(_Field.sec, 'SEC'),
        if (tracksSteps) const _WorkCol(_Field.steps, 'STEPS'),
      ];
    default: // WEIGHTED + unknown
      return const [
        _WorkCol(_Field.weight, 'KG', decimal: true),
        _WorkCol(_Field.reps, 'REPS'),
        _WorkCol(_Field.rest, 'REST'),
      ];
  }
}

String _readField(DraftSet s, _Field f) => switch (f) {
      _Field.weight => s.weightKg == null ? '' : _fmtNum(s.weightKg!),
      _Field.reps => s.reps?.toString() ?? '',
      _Field.sec => s.durationSec?.toString() ?? '',
      _Field.rest => s.restSec?.toString() ?? '',
      _Field.steps => s.stepsCount?.toString() ?? '',
    };

void _writeField(DraftSet s, _Field f, String v) {
  switch (f) {
    case _Field.weight:
      s.weightKg = double.tryParse(v);
    case _Field.reps:
      s.reps = int.tryParse(v);
    case _Field.sec:
      s.durationSec = int.tryParse(v);
    case _Field.rest:
      s.restSec = int.tryParse(v);
    case _Field.steps:
      s.stepsCount = int.tryParse(v);
  }
}

String _prevField(LastSetSnapshot p, _Field f) => switch (f) {
      _Field.weight => p.weightKg == null ? '' : _fmtNum(p.weightKg!),
      _Field.reps => p.reps?.toString() ?? '',
      _Field.sec => p.durationSec?.toString() ?? '',
      _Field.rest => p.restSec?.toString() ?? '',
      _Field.steps => p.stepsCount?.toString() ?? '',
    };

/// A set "counts" (renders green) once its type's required work fields are in.
bool _setComplete(DraftSet s, String type) => switch (type) {
      'WEIGHTED' => (s.reps ?? 0) > 0 && (s.weightKg ?? 0) > 0,
      'BODYWEIGHT' => (s.reps ?? 0) > 0,
      _ => (s.durationSec ?? 0) > 0, // DURATION, CARDIO
    };

// ─── Exercise card ─────────────────────────────────────────────────────────

class _ExerciseCard extends StatelessWidget {
  const _ExerciseCard({
    super.key,
    required this.draft,
    required this.position,
    required this.expanded,
    required this.lastSets,
    required this.clientProfileId,
    required this.sessionId,
    required this.baselineSets,
    required this.onToggleExpand,
    required this.onToggleComplete,
    required this.onRemove,
    required this.onChanged,
  });

  final DraftExercise draft;

  /// 1-based order of this card in the list — rendered as a quiet index prefix
  /// on the name so the workout reads as an ordered program.
  final int position;
  final bool expanded;
  final List<LastSetSnapshot>? lastSets;

  /// The session this card belongs to — the REST button opens its rest timer.
  final String sessionId;

  /// This exercise's sets as currently persisted on the server (last-synced
  /// baseline), used to mark which rows are "saved to the DB".
  final List<Map<String, dynamic>> baselineSets;

  /// When set, the header shows a progress (📈) button opening a per-exercise
  /// progression chart. Null for surfaces without a resolvable client profile.
  final String? clientProfileId;
  final VoidCallback onToggleExpand;
  final VoidCallback onToggleComplete;
  final VoidCallback onRemove;
  final VoidCallback onChanged;

  /// Prior set for a given row — set N maps to last session's set N, falling
  /// back to the last known set so deeper rows still get a reference.
  LastSetSnapshot? _prevFor(int setNumber) {
    final list = lastSets;
    if (list == null || list.isEmpty) return null;
    for (final s in list) {
      if (s.setNumber == setNumber) return s;
    }
    return list.last;
  }

  /// The exercise's 1-based order, rendered as a quiet tabular index to the left
  /// of the type circle so the workout reads as an ordered list. Fixed width so
  /// the numbers align (and the circles stay flush) across rows. Shared by the
  /// active and completed headers.
  Widget _indexBadge(ColorScheme scheme) {
    return SizedBox(
      width: 18,
      child: Text(
        '$position',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w700,
          color: scheme.onSurfaceVariant,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }

  /// Leading thumbnail: the muscle-group anatomical tile when we have art for
  /// the group, otherwise the tinted circle/tile + type glyph. A uniform 56px
  /// rounded footprint either way so rows line up during the art rollout.
  Widget _leadingArt(ColorScheme scheme) {
    const size = 56.0;
    final radius = BorderRadius.circular(12);
    final img = _groupImage(draft);
    if (img == null) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: _groupColor(draft, scheme),
          borderRadius: radius,
        ),
        child: Icon(_typeIcon(draft.exerciseType), size: 26, color: Colors.white),
      );
    }
    // A full-body portrait figure on a transparent canvas — contain (with a
    // little inset) keeps the whole body visible rather than cropping head/legs.
    // The figures are dark, so a white tile (hairline-bordered for definition in
    // light mode) makes the silhouette read; on the dark card it's a crisp
    // product-style thumbnail.
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
      child: Image.asset(img, fit: BoxFit.contain),
    );
  }

  /// Collapsed header for an in-progress exercise — type glyph, name, muscle
  /// group + "logged/total sets" pill, and the progress-chart shortcut.
  Widget _activeHeader(BuildContext context, ColorScheme scheme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
      child: Row(
        children: [
          _indexBadge(scheme),
          const SizedBox(width: 10),
          _leadingArt(scheme),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  draft.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    if (draft.muscleGroup != null && draft.muscleGroup!.isNotEmpty) ...[
                      Flexible(
                        child: Text(
                          draft.muscleGroup!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                    _Pill(
                      text: '${draft.loggedSetCount}/${draft.sets.length} sets',
                      tone: scheme.primary,
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (clientProfileId != null)
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: 'Progress',
              icon: Icon(Icons.trending_up, color: scheme.onSurfaceVariant),
              onPressed: () => showExerciseProgressSheet(
                context,
                clientProfileId: clientProfileId!,
                exerciseId: draft.exerciseId,
                exerciseName: draft.name,
                exerciseType: draft.exerciseType,
              ),
            ),
          const SizedBox(width: 4),
        ],
      ),
    );
  }

  /// Collapsed header for a *completed* exercise — a filled green check, the
  /// name (no strikethrough), muscle group, a "Completed" badge and a
  /// "N Sets • {volume}kg Volume" summary, with a chevron to expand the logged
  /// sets. Matches the reference design.
  Widget _completedHeader(BuildContext context, ColorScheme scheme) {
    final completed = AppColors.of(context).success;
    final n = draft.loggedSetCount;
    final vol = _exerciseVolume(draft);
    final sets = '$n ${n == 1 ? 'Set' : 'Sets'}';
    final summary = vol > 0 ? '$sets  •  ${_fmtNum(vol)}kg Volume' : sets;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
      child: Row(
        children: [
          _indexBadge(scheme),
          const SizedBox(width: 10),
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: completed,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check, size: 22, color: Colors.white),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        draft.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                      ),
                    ),
                    const SizedBox(width: 8),
                    _Pill(text: 'Completed', tone: completed),
                  ],
                ),
                if (draft.muscleGroup != null && draft.muscleGroup!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    draft.muscleGroup!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
                const SizedBox(height: 6),
                Text(
                  summary,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: completed,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Icon(
            expanded ? Icons.expand_more : Icons.chevron_right,
            color: scheme.onSurfaceVariant,
          ),
        ],
      ),
    );
  }

  /// Total training volume (Σ weight × reps over value-bearing sets), in kg.
  /// Zero for bodyweight / duration / cardio work (no weight) — the summary then
  /// shows just the set count.
  double _exerciseVolume(DraftExercise d) {
    var v = 0.0;
    for (final s in d.sets) {
      final w = s.weightKg ?? 0;
      final r = (s.reps ?? 0).toDouble();
      if (w > 0 && r > 0) v += w * r;
    }
    return v;
  }

  /// Open set [index] for editing while keeping the logger to a single open
  /// editor. The guided logger surfaces only the *first* incomplete set
  /// ([DraftExercise.activeSetIndex]); without this, tapping Set 1 then Set 2 to
  /// edit would leave two sets incomplete and hide the second one. So before
  /// opening the tapped set we resolve any *other* in-progress set: commit it
  /// back to a completed row when it carries values, or drop it when it's an
  /// untouched placeholder. Iterates high→low so list removals don't shift the
  /// indices still to be visited, adjusting [index] when an earlier set is
  /// dropped.
  void _editSet(int index) {
    for (var j = draft.sets.length - 1; j >= 0; j--) {
      if (j == index || draft.sets[j].isCompleted) continue;
      if (draft.sets[j].hasValue) {
        draft.sets[j].isCompleted = true;
      } else {
        draft.removeSet(j);
        if (j < index) index--;
      }
    }
    draft.sets[index].isCompleted = false;
    onChanged();
  }

  /// Append a fresh set and make it the one being edited. Commits the current
  /// open editor first (when it has values) so only one stays open; if that set
  /// is still empty it's already the "new" set to fill, so we don't stack
  /// another on top of it.
  void _addSet() {
    final active = draft.activeSetIndex;
    if (active != null) {
      if (!draft.sets[active].hasValue) {
        onChanged();
        return;
      }
      draft.sets[active].isCompleted = true;
    }
    draft.addSet();
    onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final cols = _workCols(draft.exerciseType, draft.tracksSteps);
    final savedFlags = _computeSavedFlags(draft.sets, baselineSets);
    final activeIndex = draft.activeSetIndex;
    final lastList = lastSets ?? const <LastSetSnapshot>[];

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      // Inherits the theme card shape: rounded corners + a hairline border so the
      // card stays defined against the surface (esp. light mode).
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header (tap to expand/collapse) — a distinct "completed" look ──
          InkWell(
            onTap: onToggleExpand,
            child: draft.isCompleted
                ? _completedHeader(context, scheme)
                : _activeHeader(context, scheme),
          ),

          // ── Expanded body: guided set-by-set logger ──
          if (expanded) ...[
            Divider(height: 1, color: scheme.outlineVariant),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (lastList.isNotEmpty) ...[
                    _LastWorkoutStrip(
                      lastSets: lastList,
                      currentSets: draft.sets,
                      type: draft.exerciseType,
                    ),
                    const SizedBox(height: 14),
                  ],
                  _ProgressSection(draft: draft),
                  const SizedBox(height: 10),
                  // Render sets in order: a resolved set as a read-only row, and
                  // the one active set inline at its own position. Editing an
                  // earlier set (e.g. Set 1) then shows its editor in place,
                  // above the later completed sets — not pushed to the bottom.
                  for (var i = 0; i < draft.sets.length; i++)
                    if (draft.sets[i].isCompleted)
                      _CompletedSetRow(
                        key: ValueKey('done-${identityHashCode(draft.sets[i])}'),
                        set: draft.sets[i],
                        type: draft.exerciseType,
                        saved: savedFlags[i],
                        onEdit: () => _editSet(i),
                        onRemove: () {
                          draft.removeSet(i);
                          onChanged();
                        },
                      )
                    else if (i == activeIndex)
                      _ActiveSetEditor(
                        key: ValueKey('active-${identityHashCode(draft.sets[i])}'),
                        set: draft.sets[i],
                        type: draft.exerciseType,
                        cols: cols,
                        sessionId: sessionId,
                        previous: _prevFor(i + 1),
                        onChanged: onChanged,
                        onComplete: () {
                          draft.sets[i].isCompleted = true;
                          Haptics.primary(); // a solid tick for logging a set
                          onChanged();
                        },
                        onSkip: () {
                          draft.sets[i]
                            ..reps = null
                            ..weightKg = null
                            ..durationSec = null
                            ..stepsCount = null
                            ..isCompleted = true;
                          Haptics.tap();
                          onChanged();
                        },
                      ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      TextButton.icon(
                        onPressed: _addSet,
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Add set'),
                        style: TextButton.styleFrom(
                          foregroundColor: scheme.primary,
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                        ),
                      ),
                      const Spacer(),
                      // While a set is active the rest control lives in its editor;
                      // once every set is resolved, surface Rest here too (next to
                      // the exercise-level done toggle that sorts the card down).
                      if (activeIndex == null) ...[
                        TextButton.icon(
                          onPressed: () => _openRestSheet(context, sessionId),
                          icon: const Icon(Icons.timer_outlined, size: 18),
                          label: const Text('Rest'),
                          style: TextButton.styleFrom(
                            foregroundColor: scheme.onSurfaceVariant,
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                          ),
                        ),
                        TextButton.icon(
                          onPressed: onToggleComplete,
                          icon: Icon(
                            draft.isCompleted
                                ? Icons.check_circle
                                : Icons.check_circle_outline,
                            size: 18,
                            color: _kSavedGreen,
                          ),
                          label: Text(draft.isCompleted ? 'Done' : 'Mark done'),
                          style: TextButton.styleFrom(
                            foregroundColor: _kSavedGreen,
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ─── Guided-logger atoms ────────────────────────────────────────────────────

/// Opens the shared session rest-timer sheet (presets / custom / pause / stop).
void _openRestSheet(BuildContext context, String sessionId) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => RestTimerSheet(sessionId: sessionId),
    );

/// `mm:ss` from a whole-second count (rest times, durations).
String _fmtMmSs(int totalSec) {
  final m = totalSec ~/ 60;
  final s = totalSec % 60;
  return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
}

/// Uppercase label shown above an active-set input.
String _fieldLabel(_Field f) => switch (f) {
      _Field.weight => 'WEIGHT (KG)',
      _Field.reps => 'REPS',
      _Field.sec => 'SECONDS',
      _Field.steps => 'STEPS',
      _Field.rest => 'REST',
    };

/// A quiet uppercase section label ("LAST SESSION", "PROGRESS").
class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.6,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    );
  }
}

/// "LAST SESSION" history line + an improvement delta (this session's heaviest
/// vs last session's), reusing the already-fetched [LastSetSnapshot]s.
class _LastWorkoutStrip extends StatelessWidget {
  const _LastWorkoutStrip({
    required this.lastSets,
    required this.currentSets,
    required this.type,
  });

  final List<LastSetSnapshot> lastSets;
  final List<DraftSet> currentSets;
  final String type;

  String _fmtPrior(LastSetSnapshot s) {
    switch (type) {
      case 'BODYWEIGHT':
        return '${s.reps ?? 0} reps';
      case 'DURATION':
      case 'CARDIO':
        return _fmtMmSs(s.durationSec ?? 0);
      default:
        final w = s.weightKg == null ? '0' : _fmtNum(s.weightKg!);
        return '${w}kg × ${s.reps ?? 0}';
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final delta = improvementKg(currentSets, lastSets);
    final up = delta != null && delta > 0;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _SectionLabel('LAST SESSION'),
              const SizedBox(height: 6),
              Wrap(
                spacing: 14,
                runSpacing: 4,
                children: [
                  for (final s in lastSets)
                    Text(
                      _fmtPrior(s),
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: scheme.onSurface,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
        if (delta != null && delta != 0) ...[
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    up ? Icons.arrow_upward : Icons.arrow_downward,
                    size: 14,
                    color: up ? _kSavedGreen : scheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 2),
                  Text(
                    '${up ? '+' : ''}${_fmtNum(delta)}kg',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: up ? _kSavedGreen : scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
              Text(
                up ? 'Improvement' : 'vs last time',
                style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

/// "PROGRESS" label, a dot per set (green=logged, muted=skipped, hollow=pending)
/// and an "X of N sets completed" count.
class _ProgressSection extends StatelessWidget {
  const _ProgressSection({required this.draft});
  final DraftExercise draft;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final n = draft.sets.length;
    final done = draft.loggedSetCount;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const _SectionLabel('PROGRESS'),
            const Spacer(),
            Text(
              '$done of $n sets completed',
              style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 7,
          runSpacing: 7,
          children: [for (final s in draft.sets) _dot(s, scheme)],
        ),
      ],
    );
  }

  Widget _dot(DraftSet s, ColorScheme scheme) {
    final logged = s.isCompleted && s.hasValue;
    final skipped = s.isCompleted && !s.hasValue;
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: logged
            ? _kSavedGreen
            : skipped
                ? scheme.onSurfaceVariant.withValues(alpha: 0.5)
                : Colors.transparent,
        border: logged ? null : Border.all(color: scheme.outlineVariant),
      ),
    );
  }
}

/// A read-only summary row for a resolved set: green check + "Set N" +
/// "{w}kg × {r} reps" (or "Skipped"), the rest taken, and an Edit/Remove menu.
class _CompletedSetRow extends StatelessWidget {
  const _CompletedSetRow({
    super.key,
    required this.set,
    required this.type,
    required this.saved,
    required this.onEdit,
    required this.onRemove,
  });

  final DraftSet set;
  final String type;

  /// Already persisted on the server (a solid vs outlined check).
  final bool saved;
  final VoidCallback onEdit;
  final VoidCallback onRemove;

  String _summary() {
    if (!set.hasValue) return 'Skipped';
    switch (type) {
      case 'BODYWEIGHT':
        return '${set.reps ?? 0} reps';
      case 'DURATION':
      case 'CARDIO':
        final base = _fmtMmSs(set.durationSec ?? 0);
        return set.stepsCount != null ? '$base · ${set.stepsCount} steps' : base;
      default:
        final w = set.weightKg == null ? '0' : _fmtNum(set.weightKg!);
        return '${w}kg × ${set.reps ?? 0} reps';
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final skipped = !set.hasValue;
    // Tap anywhere on the row to edit (re-opens it as the active set); the trash
    // at the trailing edge deletes it. Replaces the old ⋮ Edit/Remove menu.
    return InkWell(
      onTap: onEdit,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Icon(
              skipped
                  ? Icons.remove_circle_outline
                  : (saved ? Icons.check_circle : Icons.check_circle_outline),
              size: 22,
              color: skipped
                  ? scheme.onSurfaceVariant.withValues(alpha: 0.5)
                  : _kSavedGreen,
            ),
            const SizedBox(width: 10),
            // "Set N" and its summary on one row (fixed label width keeps the
            // value column aligned across sets).
            SizedBox(
              width: 52,
              child: Text('Set ${set.setNumber}',
                  style:
                      const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            ),
            const SizedBox(width: 8),
            // The set result is the screen's hero datum — give it the primary
            // text colour + weight. A skipped set stays muted (it carries no
            // value worth promoting).
            Expanded(
              child: Text(
                _summary(),
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: skipped ? FontWeight.w500 : FontWeight.w600,
                  color: skipped ? scheme.onSurfaceVariant : scheme.onSurface,
                ),
              ),
            ),
            if ((set.restSec ?? 0) > 0) ...[
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('Rest',
                      style: TextStyle(
                          fontSize: 11, color: scheme.onSurfaceVariant)),
                  Text(_fmtMmSs(set.restSec!),
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w600)),
                ],
              ),
              const SizedBox(width: 8),
            ],
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: 'Remove set',
              icon: Icon(Icons.delete_outline,
                  size: 20, color: scheme.onSurfaceVariant),
              onPressed: onRemove,
            ),
          ],
        ),
      ),
    );
  }
}

/// The single active set: "Set N" + a rest chip that opens [RestTimerSheet],
/// labeled WEIGHT/REPS number inputs (pre-filled from last time), and the
/// Skip / Complete actions. Owns its field controllers like the old set row.
class _ActiveSetEditor extends StatefulWidget {
  const _ActiveSetEditor({
    super.key,
    required this.set,
    required this.type,
    required this.cols,
    required this.sessionId,
    required this.previous,
    required this.onChanged,
    required this.onComplete,
    required this.onSkip,
  });

  final DraftSet set;
  final String type;
  final List<_WorkCol> cols;
  final String sessionId;
  final LastSetSnapshot? previous;
  final VoidCallback onChanged;
  final VoidCallback onComplete;
  final VoidCallback onSkip;

  @override
  State<_ActiveSetEditor> createState() => _ActiveSetEditorState();
}

class _ActiveSetEditorState extends State<_ActiveSetEditor> {
  final Map<_Field, TextEditingController> _ctrls = {};

  TextEditingController _ctrl(_Field f) => _ctrls.putIfAbsent(
      f, () => TextEditingController(text: _readField(widget.set, f)));

  @override
  void initState() {
    super.initState();
    // Pre-fill an untouched active set with last time's numbers so the trainer
    // can confirm or tweak (matches the reference). Skip clears them.
    final p = widget.previous;
    if (p != null && !widget.set.hasValue) {
      for (final c in widget.cols) {
        if (c.field == _Field.rest) continue;
        final text = _prevField(p, c.field);
        if (text.isEmpty) continue;
        _writeField(widget.set, c.field, text);
        _ctrl(c.field).text = text;
      }
    }
  }

  @override
  void dispose() {
    for (final c in _ctrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _onCell(_Field f, String v) {
    setState(() => _writeField(widget.set, f, v));
    widget.onChanged();
  }

  void _openRest() => _openRestSheet(context, widget.sessionId);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final inputCols = [
      for (final c in widget.cols)
        if (c.field != _Field.rest) c
    ];
    final canComplete = _setComplete(widget.set, widget.type);
    final restSec = widget.set.restSec ?? 0;

    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Set ${widget.set.setNumber}',
                  style:
                      const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const Spacer(),
              InkWell(
                onTap: _openRest,
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.timer_outlined,
                          size: 16, color: scheme.onSurfaceVariant),
                      const SizedBox(width: 4),
                      Text(
                        restSec > 0 ? 'Rest ${_fmtMmSs(restSec)}' : 'Rest',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (var i = 0; i < inputCols.length; i++) ...[
                if (i > 0) const SizedBox(width: 12),
                Expanded(
                  child: _LabeledNumber(
                    label: _fieldLabel(inputCols[i].field),
                    controller: _ctrl(inputCols[i].field),
                    decimal: inputCols[i].decimal,
                    hint: widget.previous == null
                        ? ''
                        : _prevField(widget.previous!, inputCols[i].field),
                    onChanged: (v) => _onCell(inputCols[i].field, v),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: widget.onSkip,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(46),
                    side: BorderSide(color: scheme.outlineVariant),
                    foregroundColor: scheme.onSurfaceVariant,
                  ),
                  child: const Text('Skip Set'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: canComplete ? widget.onComplete : null,
                  style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(46)),
                  child: const Text('Complete Set'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A labeled number field for the active set — uppercase caption above a bordered
/// numeric input (overrides the global filled/outlined input theme to a flat box).
class _LabeledNumber extends StatelessWidget {
  const _LabeledNumber({
    required this.label,
    required this.controller,
    required this.decimal,
    required this.hint,
    required this.onChanged,
  });

  final String label;
  final TextEditingController controller;
  final bool decimal;
  final String hint;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
            color: scheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 5),
        Container(
          height: 46,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: TextField(
            controller: controller,
            textAlign: TextAlign.center,
            keyboardType: TextInputType.numberWithOptions(decimal: decimal),
            inputFormatters: [
              FilteringTextInputFormatter.allow(
                  decimal ? RegExp(r'[0-9.]') : RegExp(r'[0-9]')),
            ],
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 20,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
            decoration: InputDecoration(
              isCollapsed: true,
              filled: false,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              hintText: hint.isEmpty ? '–' : hint,
              hintStyle: TextStyle(
                fontWeight: FontWeight.w500,
                color: scheme.onSurfaceVariant.withValues(alpha: 0.45),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 8),
            ),
            onChanged: onChanged,
          ),
        ),
      ],
    );
  }
}
