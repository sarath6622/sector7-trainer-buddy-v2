import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/core/theme/app_theme.dart';
import 'src/features/auth/application/auth_controller.dart';
import 'src/features/workout/data/workout_repository.dart';
import 'src/features/workout/data/workout_sync_service.dart';
import 'src/routing/app_router.dart';

void main() {
  runApp(const ProviderScope(child: Sector7App()));
}

class Sector7App extends ConsumerStatefulWidget {
  const Sector7App({super.key});

  @override
  ConsumerState<Sector7App> createState() => _Sector7AppState();
}

class _Sector7AppState extends ConsumerState<Sector7App>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Flush queued workout writes whenever the app returns to the foreground —
  /// the trainer often re-opens the app once they're back in wifi range.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        ref.read(authControllerProvider).status == AuthStatus.authenticated) {
      ref.read(workoutSyncServiceProvider).flushPending();
    }
  }

  /// Kick the offline machinery once a session is established: start the
  /// connectivity-driven sync, flush anything left from a prior run, and warm
  /// the exercise-library cache for offline search.
  void _onAuthenticated() {
    ref.read(workoutSyncServiceProvider).start();
    ref.read(workoutSyncServiceProvider).flushPending();
    ref.read(workoutRepositoryProvider).prefetchExerciseLibrary();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authControllerProvider, (prev, next) {
      if (prev?.status != AuthStatus.authenticated &&
          next.status == AuthStatus.authenticated) {
        _onAuthenticated();
      }
    });

    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Sector 7',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      routerConfig: router,
    );
  }
}
