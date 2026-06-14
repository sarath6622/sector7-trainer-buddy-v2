import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/application/auth_controller.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/client/presentation/badges_screen.dart';
import '../features/client/presentation/client_settings_screen.dart';
import '../features/client/presentation/client_shell.dart';
import '../features/client/presentation/reschedule_requests_screen.dart';
import '../features/client/presentation/session_detail_screen.dart';
import '../features/client/presentation/unavailability_screen.dart';
import '../features/client/presentation/workout_history_screen.dart';
import '../features/workout/presentation/workout_logger_screen.dart';
import '../features/shared/presentation/splash_screen.dart';
import '../features/trainer/data/trainer_models.dart';
import '../features/trainer/presentation/trainer_client_detail_screen.dart';
import '../features/trainer/presentation/trainer_leaves_screen.dart';
import '../features/trainer/presentation/trainer_reschedule_screen.dart';
import '../features/trainer/presentation/trainer_session_detail_screen.dart';
import '../features/trainer/presentation/trainer_shell.dart';

/// Role-based routing that mirrors src/middleware.ts:
///   TRAINER / KICKBOXING_TRAINER / CROSSFIT_TRAINER → /trainer
///   CLIENT                                          → /client
/// Admins are redirected out — they use the web console, not mobile.
final routerProvider = Provider<GoRouter>((ref) {
  final auth = ValueNotifier<AuthState>(ref.read(authControllerProvider));
  ref.listen<AuthState>(authControllerProvider, (_, next) => auth.value = next);
  ref.onDispose(auth.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: auth,
    routes: [
      GoRoute(path: '/', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: '/trainer',
        builder: (_, _) => const TrainerShell(),
        routes: [
          GoRoute(
            path: 'sessions/:id',
            builder: (_, state) => TrainerSessionDetailScreen(
              sessionId: state.pathParameters['id']!,
            ),
            routes: [
              GoRoute(
                path: 'log',
                builder: (_, state) =>
                    WorkoutLoggerScreen(sessionId: state.pathParameters['id']!),
              ),
            ],
          ),
          GoRoute(
            path: 'clients/:id',
            builder: (_, state) => TrainerClientDetailScreen(
              clientProfileId: state.pathParameters['id']!,
              client: state.extra is TrainerClient
                  ? state.extra as TrainerClient
                  : null,
            ),
          ),
          GoRoute(
            path: 'leaves',
            builder: (_, _) => const TrainerLeavesScreen(),
          ),
          GoRoute(
            path: 'reschedule-requests',
            builder: (_, _) => const TrainerRescheduleScreen(),
          ),
        ],
      ),
      GoRoute(
        path: '/client',
        builder: (_, _) => const ClientShell(),
        routes: [
          GoRoute(
            path: 'sessions/:id',
            builder: (_, state) =>
                SessionDetailScreen(sessionId: state.pathParameters['id']!),
            routes: [
              GoRoute(
                path: 'log',
                builder: (_, state) =>
                    WorkoutLoggerScreen(sessionId: state.pathParameters['id']!),
              ),
            ],
          ),
          GoRoute(
            path: 'workouts',
            builder: (_, _) => const WorkoutHistoryScreen(),
          ),
          GoRoute(
            path: 'badges',
            builder: (_, _) => const BadgesScreen(),
          ),
          GoRoute(
            path: 'unavailability',
            builder: (_, _) => const UnavailabilityScreen(),
          ),
          GoRoute(
            path: 'reschedule-requests',
            builder: (_, _) => const RescheduleRequestsScreen(),
          ),
          GoRoute(
            path: 'settings',
            builder: (_, _) => const ClientSettingsScreen(),
          ),
        ],
      ),
      GoRoute(path: '/unsupported', builder: (_, _) => const _UnsupportedRoleScreen()),
    ],
    redirect: (context, state) {
      final s = auth.value;
      final loc = state.matchedLocation;

      switch (s.status) {
        case AuthStatus.unknown:
          return loc == '/' ? null : '/';
        case AuthStatus.authenticating:
        case AuthStatus.unauthenticated:
          return loc == '/login' ? null : '/login';
        case AuthStatus.authenticated:
          final user = s.user!;
          final home = user.isTrainer
              ? '/trainer'
              : user.isClient
                  ? '/client'
                  : '/unsupported';
          // Bounce away from splash/login once authenticated.
          if (loc == '/' || loc == '/login') return home;
          return null;
      }
    },
  );
});

class _UnsupportedRoleScreen extends ConsumerWidget {
  const _UnsupportedRoleScreen();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'This account is an admin account.\nUse the Sector 7 web console.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () =>
                    ref.read(authControllerProvider.notifier).logout(),
                child: const Text('Sign out'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
