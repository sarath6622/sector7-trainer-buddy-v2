import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/feedback/haptics.dart';
import '../../data/trainer_repository.dart';

/// Shared session-lifecycle actions for the trainer (start / end / no-show).
/// Each runs the repository call, invalidates the affected providers so every
/// surface refreshes, and surfaces success/failure via a SnackBar. Returns true
/// on success. Callers own any busy/disabled state on their buttons.
class TrainerSessionActions {
  const TrainerSessionActions._();

  static Future<bool> start(
    BuildContext context,
    WidgetRef ref,
    String sessionId,
  ) =>
      _run(
        context,
        ref,
        sessionId,
        action: (repo) => repo.startSession(sessionId),
        successMessage: 'Session started',
        successHaptic: Haptics.primary,
      );

  static Future<bool> end(
    BuildContext context,
    WidgetRef ref,
    String sessionId,
  ) async {
    final notes = await _endDialog(context);
    if (notes == null) return false; // cancelled
    if (!context.mounted) return false;
    return _run(
      context,
      ref,
      sessionId,
      action: (repo) => repo.endSession(sessionId, notes: notes),
      successMessage: 'Session completed',
      successHaptic: Haptics.success,
    );
  }

  static Future<bool> noShow(
    BuildContext context,
    WidgetRef ref,
    String sessionId,
  ) async {
    final ok = await _confirm(
      context,
      title: 'Mark no-show?',
      message: 'The client will be marked as a no-show for this session.',
      confirmLabel: 'Mark no-show',
      destructive: true,
    );
    if (!ok || !context.mounted) return false;
    return _run(
      context,
      ref,
      sessionId,
      action: (repo) => repo.markNoShow(sessionId),
      successMessage: 'Marked as no-show',
      successHaptic: Haptics.warning,
    );
  }

  static Future<bool> _run(
    BuildContext context,
    WidgetRef ref,
    String sessionId, {
    required Future<void> Function(TrainerRepository repo) action,
    required String successMessage,
    required VoidCallback successHaptic,
  }) async {
    try {
      await action(ref.read(trainerRepositoryProvider));
      successHaptic();
      // Refresh every surface that shows this session or its rollups.
      ref.invalidate(trainerSessionProvider(sessionId));
      ref.invalidate(trainerTodayProvider);
      ref.invalidate(trainerUpcomingProvider);
      ref.invalidate(trainerClientsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(successMessage)));
      }
      return true;
    } catch (e) {
      Haptics.error();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_message(e))),
        );
      }
      return false;
    }
  }

  /// Optional end-of-session notes. Returns the (possibly empty) note string, or
  /// null if the trainer cancelled.
  static Future<String?> _endDialog(BuildContext context) {
    final controller = TextEditingController();
    return showDialog<String?>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('End session'),
        content: TextField(
          controller: controller,
          maxLines: 3,
          maxLength: 1000,
          decoration: const InputDecoration(
            labelText: 'Session notes (optional)',
            hintText: 'How did it go?',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, null),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Complete'),
          ),
        ],
      ),
    );
  }

  static Future<bool> _confirm(
    BuildContext context, {
    required String title,
    required String message,
    required String confirmLabel,
    bool destructive = false,
  }) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: destructive
                ? FilledButton.styleFrom(
                    backgroundColor: Theme.of(ctx).colorScheme.error,
                    foregroundColor: Theme.of(ctx).colorScheme.onError,
                  )
                : null,
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
    return ok ?? false;
  }

  static String _message(Object e) {
    final s = e.toString();
    return s.startsWith('Exception: ') ? s.substring(11) : s;
  }
}
