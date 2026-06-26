import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/glass_dock_nav_bar.dart';
import '../../../core/widgets/status_bar_overlay.dart';
import '../../../core/widgets/top_fade_scrim.dart';
import '../../community/presentation/community_screen.dart';
import 'client_dashboard_screen.dart';
import 'profile_screen.dart';
import 'progress_screen.dart';
import 'sessions_list_screen.dart';

/// Client app shell: a 5-tab bottom navigation (Home / Sessions / Progress /
/// Community / Profile). Tabs are kept alive via [IndexedStack] so switching back
/// preserves scroll position and avoids refetching. Detail screens push on top.
class ClientShell extends ConsumerStatefulWidget {
  const ClientShell({super.key});

  @override
  ConsumerState<ClientShell> createState() => _ClientShellState();
}

class _ClientShellState extends ConsumerState<ClientShell> {
  int _index = 0;

  static const _tabs = [
    ClientDashboardScreen(),
    SessionsListScreen(),
    ProgressScreen(),
    CommunityScreen(),
    ProfileScreen(),
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
            IndexedStack(index: _index, children: _tabs),
            // Dark→clear fade so content scrolls cleanly under the Dynamic Island.
            const TopFadeScrim(),
          ],
        ),
        bottomNavigationBar: GlassDockNavBar(
          selectedIndex: _index,
          onDestinationSelected: (i) => setState(() => _index = i),
          destinations: const [
            GlassDockDestination(
              icon: Icons.home_outlined,
              selectedIcon: Icons.home_rounded,
              label: 'Home',
            ),
            GlassDockDestination(
              icon: Icons.fitness_center_outlined,
              selectedIcon: Icons.fitness_center_rounded,
              label: 'Sessions',
            ),
            GlassDockDestination(
              icon: Icons.insights_outlined,
              selectedIcon: Icons.insights_rounded,
              label: 'Progress',
            ),
            GlassDockDestination(
              icon: Icons.groups_outlined,
              selectedIcon: Icons.groups_rounded,
              label: 'Community',
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
