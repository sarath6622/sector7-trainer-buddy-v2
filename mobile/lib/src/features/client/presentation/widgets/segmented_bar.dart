import 'package:flutter/material.dart';

/// A compact pill-segmented control (the Progress tab bar + range selector both
/// use it). Purely presentational — the parent owns the selected index.
class SegmentedBar extends StatelessWidget {
  const SegmentedBar({
    super.key,
    required this.labels,
    required this.index,
    required this.onChanged,
    this.fontSize = 12,
  });

  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++)
            Expanded(
              child: GestureDetector(
                onTap: () => onChanged(i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: i == index
                        ? scheme.surfaceContainerLow
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(9),
                    border: i == index
                        ? Border.all(color: scheme.outlineVariant)
                        : null,
                  ),
                  child: Text(
                    labels[i],
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: fontSize,
                      fontWeight:
                          i == index ? FontWeight.w700 : FontWeight.w500,
                      color: i == index
                          ? scheme.onSurface
                          : scheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
