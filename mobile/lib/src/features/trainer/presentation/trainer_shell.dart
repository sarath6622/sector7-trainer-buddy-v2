import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/glass_dock_nav_bar.dart';
import '../../../core/widgets/sliding_indexed_stack.dart';
import '../../../core/widgets/status_bar_overlay.dart';
import '../../../core/widgets/top_fade_scrim.dart';
import 'trainer_clients_screen.dart';
import 'trainer_profile_screen.dart';
import 'trainer_schedule_screen.dart';
import 'trainer_today_screen.dart';

/// Trainer app shell: a 4-tab bottom navigation (Today / Clients / Schedule /
/// Profile), mirroring the client shell. Tabs are kept alive via [IndexedStack]
/// so switching back preserves scroll position. Detail screens push as routes.
class TrainerShell extends ConsumerStatefulWidget {
  const TrainerShell({super.key});

  @override
  ConsumerState<TrainerShell> createState() => _TrainerShellState();
}

class _TrainerShellState extends ConsumerState<TrainerShell> {
  int _index = 0;

  static const _tabs = [
    TrainerTodayScreen(),
    TrainerClientsScreen(),
    TrainerScheduleScreen(),
    TrainerProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: statusBarOverlayFor(context),
      child: Scaffold(
        // Let tab content scroll *under* the floating dock (WhatsApp-style).
        extendBody: true,
        body: Stack(
          fit: StackFit.expand,
          children: [
            SlidingIndexedStack(index: _index, children: _tabs),
            // Dark→clear fade so content scrolls cleanly under the Dynamic Island.
            const TopFadeScrim(),
          ],
        ),
        bottomNavigationBar: GlassDockNavBar(
          selectedIndex: _index,
          onDestinationSelected: (i) => setState(() => _index = i),
          destinations: const [
            GlassDockDestination(
              icon: Icons.space_dashboard_outlined,
              selectedIcon: Icons.space_dashboard_rounded,
              label: 'Dashboard',
            ),
            GlassDockDestination(
              icon: Icons.groups_outlined,
              selectedIcon: Icons.groups_rounded,
              label: 'Clients',
            ),
            GlassDockDestination(
              icon: Icons.calendar_month_outlined,
              selectedIcon: Icons.calendar_month_rounded,
              label: 'Schedule',
            ),
            GlassDockDestination(
              icon: Icons.person_outline_rounded,
              selectedIcon: Icons.person_rounded,
              label: 'Profile',
            ),
          ],
        ),
      ),
    );
  }
}
