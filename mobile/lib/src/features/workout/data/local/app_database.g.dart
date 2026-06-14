// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $WorkoutDraftRowsTable extends WorkoutDraftRows
    with TableInfo<$WorkoutDraftRowsTable, WorkoutDraftRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $WorkoutDraftRowsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _sessionIdMeta = const VerificationMeta(
    'sessionId',
  );
  @override
  late final GeneratedColumn<String> sessionId = GeneratedColumn<String>(
    'session_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _draftJsonMeta = const VerificationMeta(
    'draftJson',
  );
  @override
  late final GeneratedColumn<String> draftJson = GeneratedColumn<String>(
    'draft_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _baselineJsonMeta = const VerificationMeta(
    'baselineJson',
  );
  @override
  late final GeneratedColumn<String> baselineJson = GeneratedColumn<String>(
    'baseline_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _syncStatusMeta = const VerificationMeta(
    'syncStatus',
  );
  @override
  late final GeneratedColumn<String> syncStatus = GeneratedColumn<String>(
    'sync_status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _lastSyncedAtMeta = const VerificationMeta(
    'lastSyncedAt',
  );
  @override
  late final GeneratedColumn<DateTime> lastSyncedAt = GeneratedColumn<DateTime>(
    'last_synced_at',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _lastErrorMeta = const VerificationMeta(
    'lastError',
  );
  @override
  late final GeneratedColumn<String> lastError = GeneratedColumn<String>(
    'last_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    sessionId,
    draftJson,
    baselineJson,
    syncStatus,
    updatedAt,
    lastSyncedAt,
    lastError,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'workout_draft_rows';
  @override
  VerificationContext validateIntegrity(
    Insertable<WorkoutDraftRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('session_id')) {
      context.handle(
        _sessionIdMeta,
        sessionId.isAcceptableOrUnknown(data['session_id']!, _sessionIdMeta),
      );
    } else if (isInserting) {
      context.missing(_sessionIdMeta);
    }
    if (data.containsKey('draft_json')) {
      context.handle(
        _draftJsonMeta,
        draftJson.isAcceptableOrUnknown(data['draft_json']!, _draftJsonMeta),
      );
    } else if (isInserting) {
      context.missing(_draftJsonMeta);
    }
    if (data.containsKey('baseline_json')) {
      context.handle(
        _baselineJsonMeta,
        baselineJson.isAcceptableOrUnknown(
          data['baseline_json']!,
          _baselineJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_baselineJsonMeta);
    }
    if (data.containsKey('sync_status')) {
      context.handle(
        _syncStatusMeta,
        syncStatus.isAcceptableOrUnknown(data['sync_status']!, _syncStatusMeta),
      );
    } else if (isInserting) {
      context.missing(_syncStatusMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    if (data.containsKey('last_synced_at')) {
      context.handle(
        _lastSyncedAtMeta,
        lastSyncedAt.isAcceptableOrUnknown(
          data['last_synced_at']!,
          _lastSyncedAtMeta,
        ),
      );
    }
    if (data.containsKey('last_error')) {
      context.handle(
        _lastErrorMeta,
        lastError.isAcceptableOrUnknown(data['last_error']!, _lastErrorMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {sessionId};
  @override
  WorkoutDraftRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return WorkoutDraftRow(
      sessionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}session_id'],
      )!,
      draftJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}draft_json'],
      )!,
      baselineJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}baseline_json'],
      )!,
      syncStatus: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync_status'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}updated_at'],
      )!,
      lastSyncedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}last_synced_at'],
      ),
      lastError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}last_error'],
      ),
    );
  }

  @override
  $WorkoutDraftRowsTable createAlias(String alias) {
    return $WorkoutDraftRowsTable(attachedDatabase, alias);
  }
}

class WorkoutDraftRow extends DataClass implements Insertable<WorkoutDraftRow> {
  final String sessionId;
  final String draftJson;
  final String baselineJson;
  final String syncStatus;
  final DateTime updatedAt;
  final DateTime? lastSyncedAt;
  final String? lastError;
  const WorkoutDraftRow({
    required this.sessionId,
    required this.draftJson,
    required this.baselineJson,
    required this.syncStatus,
    required this.updatedAt,
    this.lastSyncedAt,
    this.lastError,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['session_id'] = Variable<String>(sessionId);
    map['draft_json'] = Variable<String>(draftJson);
    map['baseline_json'] = Variable<String>(baselineJson);
    map['sync_status'] = Variable<String>(syncStatus);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    if (!nullToAbsent || lastSyncedAt != null) {
      map['last_synced_at'] = Variable<DateTime>(lastSyncedAt);
    }
    if (!nullToAbsent || lastError != null) {
      map['last_error'] = Variable<String>(lastError);
    }
    return map;
  }

  WorkoutDraftRowsCompanion toCompanion(bool nullToAbsent) {
    return WorkoutDraftRowsCompanion(
      sessionId: Value(sessionId),
      draftJson: Value(draftJson),
      baselineJson: Value(baselineJson),
      syncStatus: Value(syncStatus),
      updatedAt: Value(updatedAt),
      lastSyncedAt: lastSyncedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(lastSyncedAt),
      lastError: lastError == null && nullToAbsent
          ? const Value.absent()
          : Value(lastError),
    );
  }

  factory WorkoutDraftRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return WorkoutDraftRow(
      sessionId: serializer.fromJson<String>(json['sessionId']),
      draftJson: serializer.fromJson<String>(json['draftJson']),
      baselineJson: serializer.fromJson<String>(json['baselineJson']),
      syncStatus: serializer.fromJson<String>(json['syncStatus']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      lastSyncedAt: serializer.fromJson<DateTime?>(json['lastSyncedAt']),
      lastError: serializer.fromJson<String?>(json['lastError']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'sessionId': serializer.toJson<String>(sessionId),
      'draftJson': serializer.toJson<String>(draftJson),
      'baselineJson': serializer.toJson<String>(baselineJson),
      'syncStatus': serializer.toJson<String>(syncStatus),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
      'lastSyncedAt': serializer.toJson<DateTime?>(lastSyncedAt),
      'lastError': serializer.toJson<String?>(lastError),
    };
  }

  WorkoutDraftRow copyWith({
    String? sessionId,
    String? draftJson,
    String? baselineJson,
    String? syncStatus,
    DateTime? updatedAt,
    Value<DateTime?> lastSyncedAt = const Value.absent(),
    Value<String?> lastError = const Value.absent(),
  }) => WorkoutDraftRow(
    sessionId: sessionId ?? this.sessionId,
    draftJson: draftJson ?? this.draftJson,
    baselineJson: baselineJson ?? this.baselineJson,
    syncStatus: syncStatus ?? this.syncStatus,
    updatedAt: updatedAt ?? this.updatedAt,
    lastSyncedAt: lastSyncedAt.present ? lastSyncedAt.value : this.lastSyncedAt,
    lastError: lastError.present ? lastError.value : this.lastError,
  );
  WorkoutDraftRow copyWithCompanion(WorkoutDraftRowsCompanion data) {
    return WorkoutDraftRow(
      sessionId: data.sessionId.present ? data.sessionId.value : this.sessionId,
      draftJson: data.draftJson.present ? data.draftJson.value : this.draftJson,
      baselineJson: data.baselineJson.present
          ? data.baselineJson.value
          : this.baselineJson,
      syncStatus: data.syncStatus.present
          ? data.syncStatus.value
          : this.syncStatus,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      lastSyncedAt: data.lastSyncedAt.present
          ? data.lastSyncedAt.value
          : this.lastSyncedAt,
      lastError: data.lastError.present ? data.lastError.value : this.lastError,
    );
  }

  @override
  String toString() {
    return (StringBuffer('WorkoutDraftRow(')
          ..write('sessionId: $sessionId, ')
          ..write('draftJson: $draftJson, ')
          ..write('baselineJson: $baselineJson, ')
          ..write('syncStatus: $syncStatus, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('lastSyncedAt: $lastSyncedAt, ')
          ..write('lastError: $lastError')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    sessionId,
    draftJson,
    baselineJson,
    syncStatus,
    updatedAt,
    lastSyncedAt,
    lastError,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is WorkoutDraftRow &&
          other.sessionId == this.sessionId &&
          other.draftJson == this.draftJson &&
          other.baselineJson == this.baselineJson &&
          other.syncStatus == this.syncStatus &&
          other.updatedAt == this.updatedAt &&
          other.lastSyncedAt == this.lastSyncedAt &&
          other.lastError == this.lastError);
}

class WorkoutDraftRowsCompanion extends UpdateCompanion<WorkoutDraftRow> {
  final Value<String> sessionId;
  final Value<String> draftJson;
  final Value<String> baselineJson;
  final Value<String> syncStatus;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> lastSyncedAt;
  final Value<String?> lastError;
  final Value<int> rowid;
  const WorkoutDraftRowsCompanion({
    this.sessionId = const Value.absent(),
    this.draftJson = const Value.absent(),
    this.baselineJson = const Value.absent(),
    this.syncStatus = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.lastSyncedAt = const Value.absent(),
    this.lastError = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  WorkoutDraftRowsCompanion.insert({
    required String sessionId,
    required String draftJson,
    required String baselineJson,
    required String syncStatus,
    required DateTime updatedAt,
    this.lastSyncedAt = const Value.absent(),
    this.lastError = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : sessionId = Value(sessionId),
       draftJson = Value(draftJson),
       baselineJson = Value(baselineJson),
       syncStatus = Value(syncStatus),
       updatedAt = Value(updatedAt);
  static Insertable<WorkoutDraftRow> custom({
    Expression<String>? sessionId,
    Expression<String>? draftJson,
    Expression<String>? baselineJson,
    Expression<String>? syncStatus,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? lastSyncedAt,
    Expression<String>? lastError,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (sessionId != null) 'session_id': sessionId,
      if (draftJson != null) 'draft_json': draftJson,
      if (baselineJson != null) 'baseline_json': baselineJson,
      if (syncStatus != null) 'sync_status': syncStatus,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (lastSyncedAt != null) 'last_synced_at': lastSyncedAt,
      if (lastError != null) 'last_error': lastError,
      if (rowid != null) 'rowid': rowid,
    });
  }

  WorkoutDraftRowsCompanion copyWith({
    Value<String>? sessionId,
    Value<String>? draftJson,
    Value<String>? baselineJson,
    Value<String>? syncStatus,
    Value<DateTime>? updatedAt,
    Value<DateTime?>? lastSyncedAt,
    Value<String?>? lastError,
    Value<int>? rowid,
  }) {
    return WorkoutDraftRowsCompanion(
      sessionId: sessionId ?? this.sessionId,
      draftJson: draftJson ?? this.draftJson,
      baselineJson: baselineJson ?? this.baselineJson,
      syncStatus: syncStatus ?? this.syncStatus,
      updatedAt: updatedAt ?? this.updatedAt,
      lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
      lastError: lastError ?? this.lastError,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (sessionId.present) {
      map['session_id'] = Variable<String>(sessionId.value);
    }
    if (draftJson.present) {
      map['draft_json'] = Variable<String>(draftJson.value);
    }
    if (baselineJson.present) {
      map['baseline_json'] = Variable<String>(baselineJson.value);
    }
    if (syncStatus.present) {
      map['sync_status'] = Variable<String>(syncStatus.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (lastSyncedAt.present) {
      map['last_synced_at'] = Variable<DateTime>(lastSyncedAt.value);
    }
    if (lastError.present) {
      map['last_error'] = Variable<String>(lastError.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('WorkoutDraftRowsCompanion(')
          ..write('sessionId: $sessionId, ')
          ..write('draftJson: $draftJson, ')
          ..write('baselineJson: $baselineJson, ')
          ..write('syncStatus: $syncStatus, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('lastSyncedAt: $lastSyncedAt, ')
          ..write('lastError: $lastError, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CachedExerciseRowsTable extends CachedExerciseRows
    with TableInfo<$CachedExerciseRowsTable, CachedExerciseRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CachedExerciseRowsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _targetMuscleGroupMeta = const VerificationMeta(
    'targetMuscleGroup',
  );
  @override
  late final GeneratedColumn<String> targetMuscleGroup =
      GeneratedColumn<String>(
        'target_muscle_group',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
        defaultValue: const Constant(''),
      );
  static const VerificationMeta _categoryMeta = const VerificationMeta(
    'category',
  );
  @override
  late final GeneratedColumn<String> category = GeneratedColumn<String>(
    'category',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _exerciseTypeMeta = const VerificationMeta(
    'exerciseType',
  );
  @override
  late final GeneratedColumn<String> exerciseType = GeneratedColumn<String>(
    'exercise_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('WEIGHTED'),
  );
  static const VerificationMeta _secondaryMetricMeta = const VerificationMeta(
    'secondaryMetric',
  );
  @override
  late final GeneratedColumn<String> secondaryMetric = GeneratedColumn<String>(
    'secondary_metric',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('KM'),
  );
  static const VerificationMeta _equipmentMeta = const VerificationMeta(
    'equipment',
  );
  @override
  late final GeneratedColumn<String> equipment = GeneratedColumn<String>(
    'equipment',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    name,
    targetMuscleGroup,
    category,
    exerciseType,
    secondaryMetric,
    equipment,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cached_exercise_rows';
  @override
  VerificationContext validateIntegrity(
    Insertable<CachedExerciseRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('target_muscle_group')) {
      context.handle(
        _targetMuscleGroupMeta,
        targetMuscleGroup.isAcceptableOrUnknown(
          data['target_muscle_group']!,
          _targetMuscleGroupMeta,
        ),
      );
    }
    if (data.containsKey('category')) {
      context.handle(
        _categoryMeta,
        category.isAcceptableOrUnknown(data['category']!, _categoryMeta),
      );
    }
    if (data.containsKey('exercise_type')) {
      context.handle(
        _exerciseTypeMeta,
        exerciseType.isAcceptableOrUnknown(
          data['exercise_type']!,
          _exerciseTypeMeta,
        ),
      );
    }
    if (data.containsKey('secondary_metric')) {
      context.handle(
        _secondaryMetricMeta,
        secondaryMetric.isAcceptableOrUnknown(
          data['secondary_metric']!,
          _secondaryMetricMeta,
        ),
      );
    }
    if (data.containsKey('equipment')) {
      context.handle(
        _equipmentMeta,
        equipment.isAcceptableOrUnknown(data['equipment']!, _equipmentMeta),
      );
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CachedExerciseRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CachedExerciseRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      targetMuscleGroup: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}target_muscle_group'],
      )!,
      category: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}category'],
      )!,
      exerciseType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}exercise_type'],
      )!,
      secondaryMetric: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}secondary_metric'],
      )!,
      equipment: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}equipment'],
      ),
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $CachedExerciseRowsTable createAlias(String alias) {
    return $CachedExerciseRowsTable(attachedDatabase, alias);
  }
}

class CachedExerciseRow extends DataClass
    implements Insertable<CachedExerciseRow> {
  final String id;
  final String name;
  final String targetMuscleGroup;
  final String category;
  final String exerciseType;
  final String secondaryMetric;
  final String? equipment;
  final DateTime updatedAt;
  const CachedExerciseRow({
    required this.id,
    required this.name,
    required this.targetMuscleGroup,
    required this.category,
    required this.exerciseType,
    required this.secondaryMetric,
    this.equipment,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    map['target_muscle_group'] = Variable<String>(targetMuscleGroup);
    map['category'] = Variable<String>(category);
    map['exercise_type'] = Variable<String>(exerciseType);
    map['secondary_metric'] = Variable<String>(secondaryMetric);
    if (!nullToAbsent || equipment != null) {
      map['equipment'] = Variable<String>(equipment);
    }
    map['updated_at'] = Variable<DateTime>(updatedAt);
    return map;
  }

  CachedExerciseRowsCompanion toCompanion(bool nullToAbsent) {
    return CachedExerciseRowsCompanion(
      id: Value(id),
      name: Value(name),
      targetMuscleGroup: Value(targetMuscleGroup),
      category: Value(category),
      exerciseType: Value(exerciseType),
      secondaryMetric: Value(secondaryMetric),
      equipment: equipment == null && nullToAbsent
          ? const Value.absent()
          : Value(equipment),
      updatedAt: Value(updatedAt),
    );
  }

  factory CachedExerciseRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CachedExerciseRow(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      targetMuscleGroup: serializer.fromJson<String>(json['targetMuscleGroup']),
      category: serializer.fromJson<String>(json['category']),
      exerciseType: serializer.fromJson<String>(json['exerciseType']),
      secondaryMetric: serializer.fromJson<String>(json['secondaryMetric']),
      equipment: serializer.fromJson<String?>(json['equipment']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'targetMuscleGroup': serializer.toJson<String>(targetMuscleGroup),
      'category': serializer.toJson<String>(category),
      'exerciseType': serializer.toJson<String>(exerciseType),
      'secondaryMetric': serializer.toJson<String>(secondaryMetric),
      'equipment': serializer.toJson<String?>(equipment),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
    };
  }

  CachedExerciseRow copyWith({
    String? id,
    String? name,
    String? targetMuscleGroup,
    String? category,
    String? exerciseType,
    String? secondaryMetric,
    Value<String?> equipment = const Value.absent(),
    DateTime? updatedAt,
  }) => CachedExerciseRow(
    id: id ?? this.id,
    name: name ?? this.name,
    targetMuscleGroup: targetMuscleGroup ?? this.targetMuscleGroup,
    category: category ?? this.category,
    exerciseType: exerciseType ?? this.exerciseType,
    secondaryMetric: secondaryMetric ?? this.secondaryMetric,
    equipment: equipment.present ? equipment.value : this.equipment,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  CachedExerciseRow copyWithCompanion(CachedExerciseRowsCompanion data) {
    return CachedExerciseRow(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      targetMuscleGroup: data.targetMuscleGroup.present
          ? data.targetMuscleGroup.value
          : this.targetMuscleGroup,
      category: data.category.present ? data.category.value : this.category,
      exerciseType: data.exerciseType.present
          ? data.exerciseType.value
          : this.exerciseType,
      secondaryMetric: data.secondaryMetric.present
          ? data.secondaryMetric.value
          : this.secondaryMetric,
      equipment: data.equipment.present ? data.equipment.value : this.equipment,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CachedExerciseRow(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('targetMuscleGroup: $targetMuscleGroup, ')
          ..write('category: $category, ')
          ..write('exerciseType: $exerciseType, ')
          ..write('secondaryMetric: $secondaryMetric, ')
          ..write('equipment: $equipment, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    name,
    targetMuscleGroup,
    category,
    exerciseType,
    secondaryMetric,
    equipment,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CachedExerciseRow &&
          other.id == this.id &&
          other.name == this.name &&
          other.targetMuscleGroup == this.targetMuscleGroup &&
          other.category == this.category &&
          other.exerciseType == this.exerciseType &&
          other.secondaryMetric == this.secondaryMetric &&
          other.equipment == this.equipment &&
          other.updatedAt == this.updatedAt);
}

class CachedExerciseRowsCompanion extends UpdateCompanion<CachedExerciseRow> {
  final Value<String> id;
  final Value<String> name;
  final Value<String> targetMuscleGroup;
  final Value<String> category;
  final Value<String> exerciseType;
  final Value<String> secondaryMetric;
  final Value<String?> equipment;
  final Value<DateTime> updatedAt;
  final Value<int> rowid;
  const CachedExerciseRowsCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.targetMuscleGroup = const Value.absent(),
    this.category = const Value.absent(),
    this.exerciseType = const Value.absent(),
    this.secondaryMetric = const Value.absent(),
    this.equipment = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CachedExerciseRowsCompanion.insert({
    required String id,
    required String name,
    this.targetMuscleGroup = const Value.absent(),
    this.category = const Value.absent(),
    this.exerciseType = const Value.absent(),
    this.secondaryMetric = const Value.absent(),
    this.equipment = const Value.absent(),
    required DateTime updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       updatedAt = Value(updatedAt);
  static Insertable<CachedExerciseRow> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<String>? targetMuscleGroup,
    Expression<String>? category,
    Expression<String>? exerciseType,
    Expression<String>? secondaryMetric,
    Expression<String>? equipment,
    Expression<DateTime>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (targetMuscleGroup != null) 'target_muscle_group': targetMuscleGroup,
      if (category != null) 'category': category,
      if (exerciseType != null) 'exercise_type': exerciseType,
      if (secondaryMetric != null) 'secondary_metric': secondaryMetric,
      if (equipment != null) 'equipment': equipment,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CachedExerciseRowsCompanion copyWith({
    Value<String>? id,
    Value<String>? name,
    Value<String>? targetMuscleGroup,
    Value<String>? category,
    Value<String>? exerciseType,
    Value<String>? secondaryMetric,
    Value<String?>? equipment,
    Value<DateTime>? updatedAt,
    Value<int>? rowid,
  }) {
    return CachedExerciseRowsCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      targetMuscleGroup: targetMuscleGroup ?? this.targetMuscleGroup,
      category: category ?? this.category,
      exerciseType: exerciseType ?? this.exerciseType,
      secondaryMetric: secondaryMetric ?? this.secondaryMetric,
      equipment: equipment ?? this.equipment,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (targetMuscleGroup.present) {
      map['target_muscle_group'] = Variable<String>(targetMuscleGroup.value);
    }
    if (category.present) {
      map['category'] = Variable<String>(category.value);
    }
    if (exerciseType.present) {
      map['exercise_type'] = Variable<String>(exerciseType.value);
    }
    if (secondaryMetric.present) {
      map['secondary_metric'] = Variable<String>(secondaryMetric.value);
    }
    if (equipment.present) {
      map['equipment'] = Variable<String>(equipment.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CachedExerciseRowsCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('targetMuscleGroup: $targetMuscleGroup, ')
          ..write('category: $category, ')
          ..write('exerciseType: $exerciseType, ')
          ..write('secondaryMetric: $secondaryMetric, ')
          ..write('equipment: $equipment, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $WorkoutDraftRowsTable workoutDraftRows = $WorkoutDraftRowsTable(
    this,
  );
  late final $CachedExerciseRowsTable cachedExerciseRows =
      $CachedExerciseRowsTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    workoutDraftRows,
    cachedExerciseRows,
  ];
}

typedef $$WorkoutDraftRowsTableCreateCompanionBuilder =
    WorkoutDraftRowsCompanion Function({
      required String sessionId,
      required String draftJson,
      required String baselineJson,
      required String syncStatus,
      required DateTime updatedAt,
      Value<DateTime?> lastSyncedAt,
      Value<String?> lastError,
      Value<int> rowid,
    });
typedef $$WorkoutDraftRowsTableUpdateCompanionBuilder =
    WorkoutDraftRowsCompanion Function({
      Value<String> sessionId,
      Value<String> draftJson,
      Value<String> baselineJson,
      Value<String> syncStatus,
      Value<DateTime> updatedAt,
      Value<DateTime?> lastSyncedAt,
      Value<String?> lastError,
      Value<int> rowid,
    });

class $$WorkoutDraftRowsTableFilterComposer
    extends Composer<_$AppDatabase, $WorkoutDraftRowsTable> {
  $$WorkoutDraftRowsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get sessionId => $composableBuilder(
    column: $table.sessionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get draftJson => $composableBuilder(
    column: $table.draftJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get baselineJson => $composableBuilder(
    column: $table.baselineJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get lastSyncedAt => $composableBuilder(
    column: $table.lastSyncedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnFilters(column),
  );
}

class $$WorkoutDraftRowsTableOrderingComposer
    extends Composer<_$AppDatabase, $WorkoutDraftRowsTable> {
  $$WorkoutDraftRowsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get sessionId => $composableBuilder(
    column: $table.sessionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get draftJson => $composableBuilder(
    column: $table.draftJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get baselineJson => $composableBuilder(
    column: $table.baselineJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get lastSyncedAt => $composableBuilder(
    column: $table.lastSyncedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$WorkoutDraftRowsTableAnnotationComposer
    extends Composer<_$AppDatabase, $WorkoutDraftRowsTable> {
  $$WorkoutDraftRowsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get sessionId =>
      $composableBuilder(column: $table.sessionId, builder: (column) => column);

  GeneratedColumn<String> get draftJson =>
      $composableBuilder(column: $table.draftJson, builder: (column) => column);

  GeneratedColumn<String> get baselineJson => $composableBuilder(
    column: $table.baselineJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get lastSyncedAt => $composableBuilder(
    column: $table.lastSyncedAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get lastError =>
      $composableBuilder(column: $table.lastError, builder: (column) => column);
}

class $$WorkoutDraftRowsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $WorkoutDraftRowsTable,
          WorkoutDraftRow,
          $$WorkoutDraftRowsTableFilterComposer,
          $$WorkoutDraftRowsTableOrderingComposer,
          $$WorkoutDraftRowsTableAnnotationComposer,
          $$WorkoutDraftRowsTableCreateCompanionBuilder,
          $$WorkoutDraftRowsTableUpdateCompanionBuilder,
          (
            WorkoutDraftRow,
            BaseReferences<
              _$AppDatabase,
              $WorkoutDraftRowsTable,
              WorkoutDraftRow
            >,
          ),
          WorkoutDraftRow,
          PrefetchHooks Function()
        > {
  $$WorkoutDraftRowsTableTableManager(
    _$AppDatabase db,
    $WorkoutDraftRowsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$WorkoutDraftRowsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$WorkoutDraftRowsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$WorkoutDraftRowsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> sessionId = const Value.absent(),
                Value<String> draftJson = const Value.absent(),
                Value<String> baselineJson = const Value.absent(),
                Value<String> syncStatus = const Value.absent(),
                Value<DateTime> updatedAt = const Value.absent(),
                Value<DateTime?> lastSyncedAt = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => WorkoutDraftRowsCompanion(
                sessionId: sessionId,
                draftJson: draftJson,
                baselineJson: baselineJson,
                syncStatus: syncStatus,
                updatedAt: updatedAt,
                lastSyncedAt: lastSyncedAt,
                lastError: lastError,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String sessionId,
                required String draftJson,
                required String baselineJson,
                required String syncStatus,
                required DateTime updatedAt,
                Value<DateTime?> lastSyncedAt = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => WorkoutDraftRowsCompanion.insert(
                sessionId: sessionId,
                draftJson: draftJson,
                baselineJson: baselineJson,
                syncStatus: syncStatus,
                updatedAt: updatedAt,
                lastSyncedAt: lastSyncedAt,
                lastError: lastError,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$WorkoutDraftRowsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $WorkoutDraftRowsTable,
      WorkoutDraftRow,
      $$WorkoutDraftRowsTableFilterComposer,
      $$WorkoutDraftRowsTableOrderingComposer,
      $$WorkoutDraftRowsTableAnnotationComposer,
      $$WorkoutDraftRowsTableCreateCompanionBuilder,
      $$WorkoutDraftRowsTableUpdateCompanionBuilder,
      (
        WorkoutDraftRow,
        BaseReferences<_$AppDatabase, $WorkoutDraftRowsTable, WorkoutDraftRow>,
      ),
      WorkoutDraftRow,
      PrefetchHooks Function()
    >;
typedef $$CachedExerciseRowsTableCreateCompanionBuilder =
    CachedExerciseRowsCompanion Function({
      required String id,
      required String name,
      Value<String> targetMuscleGroup,
      Value<String> category,
      Value<String> exerciseType,
      Value<String> secondaryMetric,
      Value<String?> equipment,
      required DateTime updatedAt,
      Value<int> rowid,
    });
typedef $$CachedExerciseRowsTableUpdateCompanionBuilder =
    CachedExerciseRowsCompanion Function({
      Value<String> id,
      Value<String> name,
      Value<String> targetMuscleGroup,
      Value<String> category,
      Value<String> exerciseType,
      Value<String> secondaryMetric,
      Value<String?> equipment,
      Value<DateTime> updatedAt,
      Value<int> rowid,
    });

class $$CachedExerciseRowsTableFilterComposer
    extends Composer<_$AppDatabase, $CachedExerciseRowsTable> {
  $$CachedExerciseRowsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get targetMuscleGroup => $composableBuilder(
    column: $table.targetMuscleGroup,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get category => $composableBuilder(
    column: $table.category,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get exerciseType => $composableBuilder(
    column: $table.exerciseType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get secondaryMetric => $composableBuilder(
    column: $table.secondaryMetric,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get equipment => $composableBuilder(
    column: $table.equipment,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CachedExerciseRowsTableOrderingComposer
    extends Composer<_$AppDatabase, $CachedExerciseRowsTable> {
  $$CachedExerciseRowsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get targetMuscleGroup => $composableBuilder(
    column: $table.targetMuscleGroup,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get category => $composableBuilder(
    column: $table.category,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get exerciseType => $composableBuilder(
    column: $table.exerciseType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get secondaryMetric => $composableBuilder(
    column: $table.secondaryMetric,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get equipment => $composableBuilder(
    column: $table.equipment,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CachedExerciseRowsTableAnnotationComposer
    extends Composer<_$AppDatabase, $CachedExerciseRowsTable> {
  $$CachedExerciseRowsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get targetMuscleGroup => $composableBuilder(
    column: $table.targetMuscleGroup,
    builder: (column) => column,
  );

  GeneratedColumn<String> get category =>
      $composableBuilder(column: $table.category, builder: (column) => column);

  GeneratedColumn<String> get exerciseType => $composableBuilder(
    column: $table.exerciseType,
    builder: (column) => column,
  );

  GeneratedColumn<String> get secondaryMetric => $composableBuilder(
    column: $table.secondaryMetric,
    builder: (column) => column,
  );

  GeneratedColumn<String> get equipment =>
      $composableBuilder(column: $table.equipment, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$CachedExerciseRowsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CachedExerciseRowsTable,
          CachedExerciseRow,
          $$CachedExerciseRowsTableFilterComposer,
          $$CachedExerciseRowsTableOrderingComposer,
          $$CachedExerciseRowsTableAnnotationComposer,
          $$CachedExerciseRowsTableCreateCompanionBuilder,
          $$CachedExerciseRowsTableUpdateCompanionBuilder,
          (
            CachedExerciseRow,
            BaseReferences<
              _$AppDatabase,
              $CachedExerciseRowsTable,
              CachedExerciseRow
            >,
          ),
          CachedExerciseRow,
          PrefetchHooks Function()
        > {
  $$CachedExerciseRowsTableTableManager(
    _$AppDatabase db,
    $CachedExerciseRowsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CachedExerciseRowsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CachedExerciseRowsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CachedExerciseRowsTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> targetMuscleGroup = const Value.absent(),
                Value<String> category = const Value.absent(),
                Value<String> exerciseType = const Value.absent(),
                Value<String> secondaryMetric = const Value.absent(),
                Value<String?> equipment = const Value.absent(),
                Value<DateTime> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CachedExerciseRowsCompanion(
                id: id,
                name: name,
                targetMuscleGroup: targetMuscleGroup,
                category: category,
                exerciseType: exerciseType,
                secondaryMetric: secondaryMetric,
                equipment: equipment,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String name,
                Value<String> targetMuscleGroup = const Value.absent(),
                Value<String> category = const Value.absent(),
                Value<String> exerciseType = const Value.absent(),
                Value<String> secondaryMetric = const Value.absent(),
                Value<String?> equipment = const Value.absent(),
                required DateTime updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => CachedExerciseRowsCompanion.insert(
                id: id,
                name: name,
                targetMuscleGroup: targetMuscleGroup,
                category: category,
                exerciseType: exerciseType,
                secondaryMetric: secondaryMetric,
                equipment: equipment,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CachedExerciseRowsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CachedExerciseRowsTable,
      CachedExerciseRow,
      $$CachedExerciseRowsTableFilterComposer,
      $$CachedExerciseRowsTableOrderingComposer,
      $$CachedExerciseRowsTableAnnotationComposer,
      $$CachedExerciseRowsTableCreateCompanionBuilder,
      $$CachedExerciseRowsTableUpdateCompanionBuilder,
      (
        CachedExerciseRow,
        BaseReferences<
          _$AppDatabase,
          $CachedExerciseRowsTable,
          CachedExerciseRow
        >,
      ),
      CachedExerciseRow,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$WorkoutDraftRowsTableTableManager get workoutDraftRows =>
      $$WorkoutDraftRowsTableTableManager(_db, _db.workoutDraftRows);
  $$CachedExerciseRowsTableTableManager get cachedExerciseRows =>
      $$CachedExerciseRowsTableTableManager(_db, _db.cachedExerciseRows);
}
