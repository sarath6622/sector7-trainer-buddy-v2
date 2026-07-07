import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/core/connectivity/connectivity_service.dart';
import 'package:sector7_mobile/src/core/network/api_client.dart';
import 'package:sector7_mobile/src/core/network/api_exception.dart';
import 'package:sector7_mobile/src/features/workout/data/local/workout_local_store.dart';
import 'package:sector7_mobile/src/features/workout/data/workout_sync_service.dart';
import 'package:sector7_mobile/src/features/workout/domain/workout_draft.dart';

/// Records POSTs and can be told to throw, without any real network.
class FakeApi extends ApiClient {
  final List<Map<String, dynamic>> bodies = [];
  ApiException? error;
  int calls = 0;

  @override
  Future<dynamic> post(String path, {Object? body}) async {
    calls++;
    if (error != null) throw error!;
    bodies.add(body as Map<String, dynamic>);
    return null;
  }
}

class FakeConnectivity extends ConnectivityService {
  FakeConnectivity(this.online);
  bool online;

  @override
  Future<bool> isOnline() async => online;

  @override
  Stream<bool> get onlineChanges => const Stream.empty();
}

DraftExercise ex(String id, {bool completed = false, List<DraftSet>? sets}) =>
    DraftExercise(
      exerciseId: id,
      name: id.toUpperCase(),
      exerciseType: 'WEIGHTED',
      isCompleted: completed,
      sets: sets,
    );

DraftSet st(int n, {int? reps, double? weight}) =>
    DraftSet(setNumber: n, reps: reps, weightKg: weight);

void main() {
  late InMemoryWorkoutStore store;
  late FakeApi api;
  late FakeConnectivity conn;
  late WorkoutSyncService svc;

  setUp(() {
    store = InMemoryWorkoutStore();
    api = FakeApi();
    conn = FakeConnectivity(true);
    svc = WorkoutSyncService(store: store, api: api, connectivity: conn);
  });

  test('online save → scoped POST, marked synced, baseline advances', () async {
    final drafts = [
      ex('a', sets: [st(1, reps: 10, weight: 40)]),
    ];
    final outcome =
        await svc.saveLocalAndSync('s1', drafts: drafts, baseline: const []);

    expect(outcome, SyncOutcome.synced);
    expect(api.calls, 1);
    final body = api.bodies.single;
    expect(body['dirtyExerciseIds'], ['a']);
    expect(body['removedExerciseIds'], isEmpty);
    expect(body['removedSetsByExerciseId'], isEmpty);
    expect((await store.getDraft('s1'))!.syncStatus, WorkoutSyncStatus.synced);

    // Re-saving the same drafts is net-zero — no new POST.
    final again =
        await svc.saveLocalAndSync('s1', drafts: drafts, baseline: const []);
    expect(again, SyncOutcome.synced);
    expect(api.calls, 1);
  });

  test('offline save → queued, no POST, then flushes on reconnect', () async {
    conn.online = false;
    final drafts = [
      ex('a', sets: [st(1, reps: 10, weight: 40)]),
    ];
    final outcome =
        await svc.saveLocalAndSync('s1', drafts: drafts, baseline: const []);
    expect(outcome, SyncOutcome.queuedOffline);
    expect(api.calls, 0);
    expect((await store.getDraft('s1'))!.syncStatus, WorkoutSyncStatus.pending);

    conn.online = true;
    await svc.flushPending();
    expect(api.calls, 1);
    expect((await store.getDraft('s1'))!.syncStatus, WorkoutSyncStatus.synced);
  });

  test('network error keeps it pending; retry succeeds (idempotent)', () async {
    api.error = ApiException(message: 'offline', code: 'NETWORK_ERROR');
    final drafts = [
      ex('a', sets: [st(1, reps: 10, weight: 40)]),
    ];
    final outcome =
        await svc.saveLocalAndSync('s1', drafts: drafts, baseline: const []);
    expect(outcome, SyncOutcome.queuedOffline);
    expect((await store.getDraft('s1'))!.syncStatus, WorkoutSyncStatus.pending);

    api.error = null;
    await svc.flushPending();
    expect((await store.getDraft('s1'))!.syncStatus, WorkoutSyncStatus.synced);
  });

  test('server rejection (non-network) → failed, not silently retried', () async {
    api.error = ApiException(message: 'bad', code: 'VALIDATION_ERROR');
    final drafts = [
      ex('a', sets: [st(1, reps: 10, weight: 40)]),
    ];
    final outcome =
        await svc.saveLocalAndSync('s1', drafts: drafts, baseline: const []);
    expect(outcome, SyncOutcome.failed);
    final rec = (await store.getDraft('s1'))!;
    expect(rec.syncStatus, WorkoutSyncStatus.failed);
    expect(rec.lastError, 'bad');
  });

  test('edits made across several offline saves flush as one combined diff',
      () async {
    conn.online = false;
    await svc.saveLocalAndSync('s1',
        drafts: [
          ex('a', sets: [st(1, reps: 10, weight: 40)]),
        ],
        baseline: const []);
    await svc.saveLocalAndSync('s1',
        drafts: [
          ex('a', sets: [st(1, reps: 10, weight: 40)]),
          ex('b', sets: [st(1, reps: 5, weight: 20)]),
        ],
        baseline: const []);

    conn.online = true;
    await svc.flushPending();
    expect(api.calls, 1);
    final dirty = (api.bodies.single['dirtyExerciseIds'] as List).toSet();
    expect(dirty, {'a', 'b'});
  });

  test('flushPending no-ops while offline', () async {
    conn.online = false;
    await svc.saveLocalAndSync('s1',
        drafts: [
          ex('a', sets: [st(1, reps: 10, weight: 40)]),
        ],
        baseline: const []);
    api.calls = 0;
    await svc.flushPending();
    expect(api.calls, 0);
  });
}
