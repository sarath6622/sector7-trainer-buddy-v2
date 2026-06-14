import 'package:flutter/material.dart';

import '../../../../core/util/formatters.dart';
import '../../../client/presentation/widgets/client_widgets.dart';
import '../../data/trainer_models.dart';

/// One tappable session row for the trainer's Today / Schedule lists: a time
/// block, the client name, a status chip, and an optional [trailing] action
/// (the Today list passes an inline Start/End button; Schedule shows a chevron).
class TrainerSessionTile extends StatelessWidget {
  const TrainerSessionTile({
    super.key,
    required this.session,
    required this.onTap,
    this.trailing,
  });

  final TrainerSession session;
  final VoidCallback onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              SizedBox(
                width: 76,
                child: Text(
                  Fmt.time(session.scheduledTime),
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.clientName ?? 'Client',
                      style: Theme.of(context).textTheme.bodyLarge,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        StatusChip(status: session.status),
                        if (session.summary.isCarryForward) ...[
                          const SizedBox(width: 6),
                          Icon(Icons.move_down,
                              size: 14, color: scheme.onSurfaceVariant),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              trailing ??
                  Icon(Icons.chevron_right, color: scheme.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}
