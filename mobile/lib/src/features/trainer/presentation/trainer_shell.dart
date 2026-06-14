import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
    return Scaffold(
      body: IndexedStack(index: _index, children: _tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.today_outlined),
            selectedIcon: Icon(Icons.today),
            label: 'Today',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Clients',
          ),
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month),
            label: 'Schedule',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}
