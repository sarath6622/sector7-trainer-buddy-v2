import { PrismaClient, type DayOfWeek, type ExerciseType } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...\n');

  const pw = await hash('password123', 12);

  // ─── Branch ─────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { id: 'branch-main' },
    update: {},
    create: {
      id: 'branch-main',
      name: 'Sector 7 Main',
      address: '123 Fitness Avenue, Koramangala, Bangalore',
      phone: '+91-9876543210',
      email: 'main@sector7.fitness',
      isActive: true,
    },
  });
  console.log(`Branch: ${branch.name}`);

  // ─── Branch Settings ────────────────────────────────
  await prisma.branchSettings.upsert({
    where: { branchId: branch.id },
    update: {},
    create: {
      branchId: branch.id,
      defaultSessionDurationMin: 60,
      carryForwardLimit: 3,
      cancellationPolicyEnabled: false,
      cancellationWindowMin: 120,
      reminderTimingMin: 60,
      noShowThresholdMin: 15,
      kickboxingClassSizeLimit: 20,
    },
  });

  // ─── Admin ─────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: 'admin@sector7.com' },
    update: {},
    create: {
      email: 'admin@sector7.com',
      passwordHash: pw,
      firstName: 'Sarath',
      lastName: 'Kumar',
      phone: '+91-9876543210',
      roles: ['BRANCH_ADMIN'],
      branchId: branch.id,
      isActive: true,
    },
  });
  console.log(`Admin:   admin@sector7.com / password123`);

  // ─── Trainers ──────────────────────────────────────
  const trainerData = [
    {
      email: 'ravi@sector7.com',
      firstName: 'Ravi',
      lastName: 'Shankar',
      phone: '+91-9001000001',
      specialties: ['strength', 'hypertrophy', 'powerlifting'],
      certifications: ['ACE-CPT', 'NSCA-CSCS'],
      bio: 'Former national powerlifter with 8 years of coaching experience.',
      workingHoursStart: '06:00',
      workingHoursEnd: '14:00',
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const,
    },
    {
      email: 'deepa@sector7.com',
      firstName: 'Deepa',
      lastName: 'Nair',
      phone: '+91-9001000002',
      specialties: ['cardio', 'HIIT', 'functional'],
      certifications: ['NASM-CPT'],
      bio: 'Cardio and functional training specialist. Marathon runner.',
      workingHoursStart: '07:00',
      workingHoursEnd: '15:00',
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const,
    },
    {
      email: 'arjun@sector7.com',
      firstName: 'Arjun',
      lastName: 'Reddy',
      phone: '+91-9001000003',
      specialties: ['strength', 'rehabilitation', 'flexibility'],
      certifications: ['ACE-CPT', 'FMS-L2'],
      bio: 'Rehabilitation and corrective exercise specialist.',
      workingHoursStart: '08:00',
      workingHoursEnd: '18:00',
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const,
    },
  ];

  const trainers: { id: string; profileId: string; name: string }[] = [];

  for (const t of trainerData) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: {
        email: t.email,
        passwordHash: pw,
        firstName: t.firstName,
        lastName: t.lastName,
        phone: t.phone,
        roles: ['TRAINER'],
        branchId: branch.id,
        isActive: true,
      },
    });

    const profile = await prisma.trainerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        branchId: branch.id,
        specialties: t.specialties,
        certifications: t.certifications,
        bio: t.bio,
        workingHoursStart: t.workingHoursStart,
        workingHoursEnd: t.workingHoursEnd,
        workingDays: [...t.workingDays] as DayOfWeek[],
      },
    });

    trainers.push({ id: user.id, profileId: profile.id, name: `${t.firstName} ${t.lastName}` });
    console.log(`Trainer: ${t.email} / password123`);
  }

  // ─── Clients ───────────────────────────────────────
  const clientData = [
    {
      email: 'ananya@gmail.com',
      firstName: 'Ananya',
      lastName: 'Sharma',
      phone: '+91-9002000001',
      height: 163,
      intakeWeight: 58,
      intakeBodyFat: 24,
      fitnessGoals: 'Tone up and build lean muscle',
      emergencyContactName: 'Vikram Sharma',
      emergencyContactPhone: '+91-9002000010',
    },
    {
      email: 'karthik@gmail.com',
      firstName: 'Karthik',
      lastName: 'Iyer',
      phone: '+91-9002000002',
      height: 178,
      intakeWeight: 82,
      intakeBodyFat: 18,
      fitnessGoals: 'Build strength and gain muscle mass',
      emergencyContactName: 'Lakshmi Iyer',
      emergencyContactPhone: '+91-9002000011',
    },
    {
      email: 'meera@gmail.com',
      firstName: 'Meera',
      lastName: 'Pillai',
      phone: '+91-9002000003',
      height: 158,
      intakeWeight: 65,
      intakeBodyFat: 28,
      fitnessGoals: 'Weight loss and improve stamina',
      emergencyContactName: 'Suresh Pillai',
      emergencyContactPhone: '+91-9002000012',
    },
    {
      email: 'rohit@gmail.com',
      firstName: 'Rohit',
      lastName: 'Das',
      phone: '+91-9002000004',
      height: 175,
      intakeWeight: 78,
      intakeBodyFat: 20,
      fitnessGoals: 'Athletic performance and flexibility',
      emergencyContactName: 'Priya Das',
      emergencyContactPhone: '+91-9002000013',
    },
    {
      email: 'sneha@gmail.com',
      firstName: 'Sneha',
      lastName: 'Gupta',
      phone: '+91-9002000005',
      height: 160,
      intakeWeight: 55,
      intakeBodyFat: 22,
      fitnessGoals: 'Posture correction and core strength',
      emergencyContactName: 'Rahul Gupta',
      emergencyContactPhone: '+91-9002000014',
    },
    {
      email: 'arun@gmail.com',
      firstName: 'Arun',
      lastName: 'Kumar',
      phone: '+91-9002000006',
      height: 180,
      intakeWeight: 90,
      intakeBodyFat: 25,
      fitnessGoals: 'Fat loss and muscle definition',
      emergencyContactName: 'Sita Kumar',
      emergencyContactPhone: '+91-9002000015',
    },
  ];

  const clients: { id: string; profileId: string; name: string }[] = [];

  for (const c of clientData) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: {
        email: c.email,
        passwordHash: pw,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        roles: ['CLIENT'],
        branchId: branch.id,
        isActive: true,
      },
    });

    const profile = await prisma.clientProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        branchId: branch.id,
        height: c.height,
        intakeWeight: c.intakeWeight,
        intakeBodyFat: c.intakeBodyFat,
        fitnessGoals: c.fitnessGoals,
        emergencyContactName: c.emergencyContactName,
        emergencyContactPhone: c.emergencyContactPhone,
      },
    });

    clients.push({ id: user.id, profileId: profile.id, name: `${c.firstName} ${c.lastName}` });
    console.log(`Client:  ${c.email} / password123`);
  }

  // ─── PT Packages (Trainer-Client Mappings) ────────
  // Ravi: Ananya, Karthik (8 sessions/month each)
  // Deepa: Meera, Rohit (8 sessions/month each)
  // Arjun: Sneha, Arun (8 sessions/month each)
  const mappings = [
    { trainer: 0, client: 0, sessions: 8, charge: 1500 },
    { trainer: 0, client: 1, sessions: 8, charge: 1500 },
    { trainer: 1, client: 2, sessions: 8, charge: 1200 },
    { trainer: 1, client: 3, sessions: 8, charge: 1200 },
    { trainer: 2, client: 4, sessions: 8, charge: 1400 },
    { trainer: 2, client: 5, sessions: 8, charge: 1400 },
  ];

  for (const m of mappings) {
    const t = trainers[m.trainer]!;
    const c = clients[m.client]!;
    const existing = await prisma.ptPackage.findFirst({
      where: { clientProfileId: c.profileId, trainerProfileId: t.profileId },
    });
    if (!existing) {
      await prisma.ptPackage.create({
        data: {
          branchId: branch.id,
          clientProfileId: c.profileId,
          trainerProfileId: t.profileId,
          sessionsPerMonth: m.sessions,
          sessionChargeAmount: m.charge,
          startDate: new Date('2026-03-01'),
          isActive: true,
        },
      });
    }
    console.log(`Mapping: ${t.name} → ${c.name} (${m.sessions} sessions/month)`);
  }

  // ─── Schedules & Sessions ──────────────────────────
  // Create recurring schedules and generate March 2026 sessions
  const scheduleConfig = [
    // Ravi's clients
    { trainer: 0, client: 0, day: 'MONDAY', time: '07:00' },
    { trainer: 0, client: 0, day: 'THURSDAY', time: '07:00' },
    { trainer: 0, client: 1, day: 'TUESDAY', time: '08:00' },
    { trainer: 0, client: 1, day: 'FRIDAY', time: '08:00' },
    // Deepa's clients
    { trainer: 1, client: 2, day: 'MONDAY', time: '09:00' },
    { trainer: 1, client: 2, day: 'WEDNESDAY', time: '09:00' },
    { trainer: 1, client: 3, day: 'TUESDAY', time: '10:00' },
    { trainer: 1, client: 3, day: 'THURSDAY', time: '10:00' },
    // Arjun's clients
    { trainer: 2, client: 4, day: 'WEDNESDAY', time: '11:00' },
    { trainer: 2, client: 4, day: 'FRIDAY', time: '11:00' },
    { trainer: 2, client: 5, day: 'MONDAY', time: '12:00' },
    { trainer: 2, client: 5, day: 'THURSDAY', time: '12:00' },
  ];

  const dayMap: Record<string, number> = {
    SUNDAY: 0,
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
  };

  for (const sc of scheduleConfig) {
    const t = trainers[sc.trainer]!;
    const c = clients[sc.client]!;

    // Idempotent: reuse existing schedule with same trainer+client+day+time
    const existingSchedule = await prisma.sessionSchedule.findFirst({
      where: {
        branchId: branch.id,
        trainerProfileId: t.profileId,
        clientProfileId: c.profileId,
        dayOfWeek: sc.day as DayOfWeek,
        startTime: sc.time,
      },
    });

    const schedule =
      existingSchedule ??
      (await prisma.sessionSchedule.create({
        data: {
          branchId: branch.id,
          clientProfileId: c.profileId,
          trainerProfileId: t.profileId,
          dayOfWeek: sc.day as DayOfWeek,
          startTime: sc.time,
          durationMin: 60,
          validFrom: new Date('2026-03-01'),
          isActive: true,
        },
      }));

    // Generate session instances for March 2026
    const targetDay = dayMap[sc.day]!;
    const sessions: Date[] = [];
    for (let d = 1; d <= 31; d++) {
      const date = new Date(2026, 2, d); // March 2026
      if (date.getMonth() !== 2) break;
      if (date.getDay() === targetDay) {
        sessions.push(date);
      }
    }

    for (const sessionDate of sessions) {
      // Skip if a session already exists for this client+trainer+date (any schedule)
      const existing = await prisma.sessionInstance.findFirst({
        where: {
          branchId: branch.id,
          clientProfileId: c.profileId,
          trainerProfileId: t.profileId,
          scheduledDate: sessionDate,
          scheduledTime: sc.time,
        },
      });
      if (existing) continue;

      await prisma.sessionInstance.create({
        data: {
          branchId: branch.id,
          scheduleId: schedule.id,
          clientProfileId: c.profileId,
          trainerProfileId: t.profileId,
          scheduledDate: sessionDate,
          scheduledTime: sc.time,
          durationMin: 60,
          status: 'SCHEDULED',
        },
      });
    }
  }
  console.log(
    `Schedules: ${scheduleConfig.length} recurring schedules with March 2026 sessions created`,
  );

  // ─── Exercises ─────────────────────────────────────
  const exercises: {
    id: string;
    name: string;
    targetMuscleGroup: string;
    secondaryMuscles: string[];
    equipmentRequired: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    category: 'HYPERTROPHY' | 'CARDIO' | 'FLEXIBILITY' | 'STRENGTH' | 'FUNCTIONAL';
    exerciseType: ExerciseType;
    instructions: string;
  }[] = [
    // ── WEIGHTED ──────────────────────────────────────────────────────────
    {
      id: 'ex-bench-press',
      name: 'Bench Press',
      targetMuscleGroup: 'Chest',
      secondaryMuscles: ['Triceps', 'Shoulders'],
      equipmentRequired: 'Barbell, Bench',
      difficulty: 'MEDIUM',
      category: 'HYPERTROPHY',
      exerciseType: 'WEIGHTED',
      instructions: 'Lie on bench, grip barbell shoulder-width, lower to chest, press up.',
    },
    {
      id: 'ex-incline-db-press',
      name: 'Incline Dumbbell Press',
      targetMuscleGroup: 'Chest',
      secondaryMuscles: ['Triceps', 'Shoulders'],
      equipmentRequired: 'Dumbbells, Incline Bench',
      difficulty: 'MEDIUM',
      category: 'HYPERTROPHY',
      exerciseType: 'WEIGHTED',
      instructions: 'Set bench to 30–45°, press dumbbells from chest to full extension.',
    },
    {
      id: 'ex-cable-fly',
      name: 'Cable Fly',
      targetMuscleGroup: 'Chest',
      secondaryMuscles: ['Shoulders'],
      equipmentRequired: 'Cable Machine',
      difficulty: 'EASY',
      category: 'HYPERTROPHY',
      exerciseType: 'WEIGHTED',
      instructions: 'Set cables at chest height, sweep arms together in a wide arc.',
    },
    {
      id: 'ex-squat',
      name: 'Barbell Squat',
      targetMuscleGroup: 'Quadriceps',
      secondaryMuscles: ['Glutes', 'Hamstrings', 'Core'],
      equipmentRequired: 'Barbell, Squat Rack',
      difficulty: 'MEDIUM',
      category: 'STRENGTH',
      exerciseType: 'WEIGHTED',
      instructions: 'Stand with barbell on upper back, squat down to parallel, drive up.',
    },
    {
      id: 'ex-leg-press',
      name: 'Leg Press',
      targetMuscleGroup: 'Quadriceps',
      secondaryMuscles: ['Glutes', 'Hamstrings'],
      equipmentRequired: 'Leg Press Machine',
      difficulty: 'MEDIUM',
      category: 'STRENGTH',
      exerciseType: 'WEIGHTED',
      instructions:
        'Sit in machine, press platform away until legs are nearly straight, lower with control.',
    },
    {
      id: 'ex-deadlift',
      name: 'Deadlift',
      targetMuscleGroup: 'Back',
      secondaryMuscles: ['Hamstrings', 'Glutes', 'Core'],
      equipmentRequired: 'Barbell',
      difficulty: 'HARD',
      category: 'STRENGTH',
      exerciseType: 'WEIGHTED',
      instructions: 'Hinge at hips, grip bar, drive through floor to stand.',
    },
    {
      id: 'ex-rdl',
      name: 'Romanian Deadlift',
      targetMuscleGroup: 'Hamstrings',
      secondaryMuscles: ['Glutes', 'Lower Back'],
      equipmentRequired: 'Barbell',
      difficulty: 'MEDIUM',
      category: 'STRENGTH',
      exerciseType: 'WEIGHTED',
      instructions:
        'Hold bar at hips, hinge forward keeping back flat until hamstrings stretch, return.',
    },
    {
      id: 'ex-ohp',
      name: 'Overhead Press',
      targetMuscleGroup: 'Shoulders',
      secondaryMuscles: ['Triceps', 'Core'],
      equipmentRequired: 'Barbell',
      difficulty: 'MEDIUM',
      category: 'STRENGTH',
      exerciseType: 'WEIGHTED',
      instructions: 'Press barbell from shoulders to overhead, lock out arms.',
    },
    {
      id: 'ex-db-shoulder-press',
      name: 'Dumbbell Shoulder Press',
      targetMuscleGroup: 'Shoulders',
      secondaryMuscles: ['Triceps'],
      equipmentRequired: 'Dumbbells',
      difficulty: 'MEDIUM',
      category: 'HYPERTROPHY',
      exerciseType: 'WEIGHTED',
      instructions: 'Press dumbbells from ear height to full extension overhead.',
    },
    {
      id: 'ex-row',
      name: 'Barbell Row',
      targetMuscleGroup: 'Back',
      secondaryMuscles: ['Biceps', 'Core'],
      equipmentRequired: 'Barbell',
      difficulty: 'MEDIUM',
      category: 'HYPERTROPHY',
      exerciseType: 'WEIGHTED',
      instructions: 'Bend over, pull barbell to lower chest, squeeze shoulder blades.',
    },
    {
      id: 'ex-lat-pulldown',
      name: 'Lat Pulldown',
      targetMuscleGroup: 'Back',
      secondaryMuscles: ['Biceps'],
      equipmentRequired: 'Cable Machine',
      difficulty: 'MEDIUM',
      category: 'HYPERTROPHY',
      exerciseType: 'WEIGHTED',
      instructions: 'Grip wide bar, pull down to upper chest, return with control.',
    },
    {
      id: 'ex-seated-cable-row',
      name: 'Seated Cable Row',
      targetMuscleGroup: 'Back',
      secondaryMuscles: ['Biceps', 'Rear Deltoid'],
      equipmentRequired: 'Cable Machine',
      difficulty: 'EASY',
      category: 'HYPERTROPHY',
      exerciseType: 'WEIGHTED',
      instructions: 'Sit upright, row handle to lower abdomen, squeeze back, return.',
    },
    {
      id: 'ex-curl',
      name: 'Bicep Curl',
      targetMuscleGroup: 'Biceps',
      secondaryMuscles: ['Forearms'],
      equipmentRequired: 'Dumbbells',
      difficulty: 'EASY',
      category: 'HYPERTROPHY',
      exerciseType: 'WEIGHTED',
      instructions: 'Curl dumbbells from sides to shoulders, lower with control.',
    },
    {
      id: 'ex-hammer-curl',
      name: 'Hammer Curl',
      targetMuscleGroup: 'Biceps',
      secondaryMuscles: ['Forearms', 'Brachialis'],
      equipmentRequired: 'Dumbbells',
      difficulty: 'EASY',
      category: 'HYPERTROPHY',
      exerciseType: 'WEIGHTED',
      instructions: 'Neutral grip, curl dumbbells keeping elbows tucked, lower slowly.',
    },
    {
      id: 'ex-tricep-pushdown',
      name: 'Tricep Pushdown',
      targetMuscleGroup: 'Triceps',
      secondaryMuscles: [],
      equipmentRequired: 'Cable Machine',
      difficulty: 'EASY',
      category: 'HYPERTROPHY',
      exerciseType: 'WEIGHTED',
      instructions: 'Grip bar at chest, push down until arms fully extend, return.',
    },
    {
      id: 'ex-leg-curl',
      name: 'Leg Curl',
      targetMuscleGroup: 'Hamstrings',
      secondaryMuscles: ['Calves'],
      equipmentRequired: 'Leg Curl Machine',
      difficulty: 'EASY',
      category: 'HYPERTROPHY',
      exerciseType: 'WEIGHTED',
      instructions: 'Lie face down, curl heels toward glutes, lower with control.',
    },
    {
      id: 'ex-calf-raise',
      name: 'Standing Calf Raise',
      targetMuscleGroup: 'Calves',
      secondaryMuscles: [],
      equipmentRequired: 'Barbell or Smith Machine',
      difficulty: 'EASY',
      category: 'HYPERTROPHY',
      exerciseType: 'WEIGHTED',
      instructions: 'Stand on edge of step, rise onto toes fully, lower heel below step.',
    },
    // ── BODYWEIGHT ────────────────────────────────────────────────────────
    {
      id: 'ex-pullup',
      name: 'Pull-up',
      targetMuscleGroup: 'Back',
      secondaryMuscles: ['Biceps', 'Core'],
      equipmentRequired: 'Pull-up Bar',
      difficulty: 'HARD',
      category: 'HYPERTROPHY',
      exerciseType: 'BODYWEIGHT',
      instructions: 'Hang from bar, pull chin above bar, lower with control.',
    },
    {
      id: 'ex-pushup',
      name: 'Push-up',
      targetMuscleGroup: 'Chest',
      secondaryMuscles: ['Triceps', 'Shoulders', 'Core'],
      equipmentRequired: 'None',
      difficulty: 'EASY',
      category: 'FUNCTIONAL',
      exerciseType: 'BODYWEIGHT',
      instructions: 'Hands shoulder-width, lower chest to floor, push back up. Keep body straight.',
    },
    {
      id: 'ex-dip',
      name: 'Dip',
      targetMuscleGroup: 'Triceps',
      secondaryMuscles: ['Chest', 'Shoulders'],
      equipmentRequired: 'Parallel Bars',
      difficulty: 'MEDIUM',
      category: 'HYPERTROPHY',
      exerciseType: 'BODYWEIGHT',
      instructions: 'Support on parallel bars, lower until elbows at 90°, push back up.',
    },
    {
      id: 'ex-lunge',
      name: 'Walking Lunge',
      targetMuscleGroup: 'Quadriceps',
      secondaryMuscles: ['Glutes', 'Hamstrings'],
      equipmentRequired: 'None',
      difficulty: 'EASY',
      category: 'FUNCTIONAL',
      exerciseType: 'BODYWEIGHT',
      instructions: 'Step forward, lower back knee toward floor, alternate legs.',
    },
    {
      id: 'ex-bw-squat',
      name: 'Bodyweight Squat',
      targetMuscleGroup: 'Quadriceps',
      secondaryMuscles: ['Glutes', 'Core'],
      equipmentRequired: 'None',
      difficulty: 'EASY',
      category: 'FUNCTIONAL',
      exerciseType: 'BODYWEIGHT',
      instructions: 'Feet shoulder-width, squat until thighs parallel, drive back up.',
    },
    // ── DURATION ──────────────────────────────────────────────────────────
    {
      id: 'ex-plank',
      name: 'Plank',
      targetMuscleGroup: 'Core',
      secondaryMuscles: ['Shoulders', 'Glutes'],
      equipmentRequired: 'None',
      difficulty: 'EASY',
      category: 'FUNCTIONAL',
      exerciseType: 'DURATION',
      instructions: 'Hold push-up position on forearms, keep body straight.',
    },
    {
      id: 'ex-side-plank',
      name: 'Side Plank',
      targetMuscleGroup: 'Core',
      secondaryMuscles: ['Shoulders', 'Obliques'],
      equipmentRequired: 'None',
      difficulty: 'MEDIUM',
      category: 'FUNCTIONAL',
      exerciseType: 'DURATION',
      instructions: 'Support on one forearm, stack feet, keep hips elevated for the set time.',
    },
    {
      id: 'ex-wall-sit',
      name: 'Wall Sit',
      targetMuscleGroup: 'Quadriceps',
      secondaryMuscles: ['Glutes', 'Calves'],
      equipmentRequired: 'None',
      difficulty: 'MEDIUM',
      category: 'FUNCTIONAL',
      exerciseType: 'DURATION',
      instructions: 'Slide back down wall until thighs are parallel to floor, hold.',
    },
    // ── CARDIO ────────────────────────────────────────────────────────────
    {
      id: 'ex-treadmill',
      name: 'Treadmill Run',
      targetMuscleGroup: 'Full Body',
      secondaryMuscles: ['Calves', 'Core'],
      equipmentRequired: 'Treadmill',
      difficulty: 'EASY',
      category: 'CARDIO',
      exerciseType: 'CARDIO',
      instructions: 'Set pace and incline, maintain steady running form.',
    },
    {
      id: 'ex-cycling',
      name: 'Stationary Cycling',
      targetMuscleGroup: 'Full Body',
      secondaryMuscles: ['Quadriceps', 'Calves', 'Core'],
      equipmentRequired: 'Stationary Bike',
      difficulty: 'EASY',
      category: 'CARDIO',
      exerciseType: 'CARDIO',
      instructions: 'Adjust seat height, pedal at steady cadence, vary resistance.',
    },
    {
      id: 'ex-rowing',
      name: 'Rowing Machine',
      targetMuscleGroup: 'Full Body',
      secondaryMuscles: ['Back', 'Core', 'Arms'],
      equipmentRequired: 'Rowing Ergometer',
      difficulty: 'MEDIUM',
      category: 'CARDIO',
      exerciseType: 'CARDIO',
      instructions:
        'Drive with legs first, lean back, then pull handle to lower chest. Reverse to return.',
    },
  ];

  // Build a lookup map for set generation
  const exerciseTypeMap: Record<string, ExerciseType> = {};
  for (const ex of exercises) {
    exerciseTypeMap[ex.id] = ex.exerciseType;
  }

  for (const ex of exercises) {
    await prisma.exercise.upsert({
      where: { id: ex.id },
      update: { exerciseType: ex.exerciseType },
      create: ex,
    });
  }
  console.log(`Exercises: ${exercises.length} seeded`);

  // ─── Mark past sessions as COMPLETED with attendance & workout logs ──
  const today = new Date(2026, 2, 20); // March 20, 2026
  const pastSessions = await prisma.sessionInstance.findMany({
    where: {
      branchId: branch.id,
      scheduledDate: { lt: today },
      status: 'SCHEDULED',
    },
    include: {
      trainer: { include: { user: true } },
      client: true,
    },
  });

  let completedCount = 0;
  let noShowCount = 0;
  const exerciseIds = exercises.map((e) => e.id);

  for (const session of pastSessions) {
    // 85% completed, 10% no-show, 5% cancelled
    const rand = Math.random();
    if (rand < 0.85) {
      // Completed session
      const startHour = parseInt(session.scheduledTime.split(':')[0]!);
      const startedAt = new Date(session.scheduledDate);
      startedAt.setHours(startHour, 0, 0, 0);
      const endedAt = new Date(startedAt);
      endedAt.setMinutes(endedAt.getMinutes() + 55 + Math.floor(Math.random() * 15));

      await prisma.sessionInstance.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETED',
          startedAt,
          endedAt,
          actualDurationMin: Math.round((endedAt.getTime() - startedAt.getTime()) / 60000),
          startedByUserId: session.trainer.userId,
          endedByUserId: session.trainer.userId,
        },
      });

      // Create 2-4 workout logs per completed session
      const numExercises = 2 + Math.floor(Math.random() * 3);
      const shuffled = [...exerciseIds].sort(() => Math.random() - 0.5);
      for (let i = 0; i < numExercises; i++) {
        const exId = shuffled[i % shuffled.length]!;
        const exType = exerciseTypeMap[exId] ?? 'WEIGHTED';
        const numSets = 3 + Math.floor(Math.random() * 2);
        const log = await prisma.workoutLog.create({
          data: {
            sessionInstanceId: session.id,
            exerciseId: exId,
            orderIndex: i,
          },
        });
        for (let s = 1; s <= numSets; s++) {
          if (exType === 'WEIGHTED') {
            await prisma.workoutSet.create({
              data: {
                workoutLogId: log.id,
                setNumber: s,
                reps: 6 + Math.floor(Math.random() * 10),
                weightKg: 20 + Math.floor(Math.random() * 80),
                rpe: 6 + Math.floor(Math.random() * 4),
              },
            });
          } else if (exType === 'BODYWEIGHT') {
            await prisma.workoutSet.create({
              data: {
                workoutLogId: log.id,
                setNumber: s,
                reps: 8 + Math.floor(Math.random() * 12),
                rpe: 5 + Math.floor(Math.random() * 5),
              },
            });
          } else if (exType === 'DURATION') {
            await prisma.workoutSet.create({
              data: {
                workoutLogId: log.id,
                setNumber: s,
                durationSec: 20 + Math.floor(Math.random() * 100),
                rpe: 5 + Math.floor(Math.random() * 5),
              },
            });
          } else {
            // CARDIO — durationSec + distance in notes
            const distanceKm = (1 + Math.random() * 4).toFixed(1);
            await prisma.workoutSet.create({
              data: {
                workoutLogId: log.id,
                setNumber: s,
                durationSec: 600 + Math.floor(Math.random() * 1200),
                notes: distanceKm,
              },
            });
          }
        }
      }
      completedCount++;
    } else if (rand < 0.95) {
      // No-show
      await prisma.sessionInstance.update({
        where: { id: session.id },
        data: {
          status: 'NO_SHOW',
          noShowMarkedAt: new Date(session.scheduledDate),
          noShowMarkedByUserId: session.trainer.userId,
        },
      });
      noShowCount++;
    } else {
      // Cancelled
      await prisma.sessionInstance.update({
        where: { id: session.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(session.scheduledDate),
          cancelledByUserId: admin.id,
        },
      });
    }
  }
  console.log(
    `Sessions: ${completedCount} completed, ${noShowCount} no-shows, ${pastSessions.length - completedCount - noShowCount} cancelled`,
  );

  // ─── Progress Entries ────────────────────────────────
  for (const c of clients) {
    const trainer = trainers.find((_, idx) => {
      const m = mappings.find((mm) => mm.client === clients.indexOf(c));
      return m ? m.trainer === idx : false;
    });
    const recordedBy = trainer?.id ?? admin.id;

    // Weekly progress entries for March
    for (let week = 1; week <= 3; week++) {
      const date = new Date(2026, 2, week * 7);
      const clientIdx = clients.indexOf(c);
      const baseWeight = clientData[clientIdx]!.intakeWeight;
      const baseFat = clientData[clientIdx]!.intakeBodyFat;

      await prisma.progressEntry.create({
        data: {
          clientProfileId: c.profileId,
          recordedByUserId: recordedBy,
          recordedAt: date,
          weightKg: baseWeight - week * 0.3 + (Math.random() * 0.4 - 0.2),
          bodyFatPercent: baseFat - week * 0.2 + (Math.random() * 0.3 - 0.15),
          notes: week === 1 ? 'Initial assessment' : `Week ${week} check-in`,
        },
      });
    }
  }
  console.log(`Progress: ${clients.length * 3} entries created`);

  // ─── Kickboxing Trainer & Class ──────────────────────
  const kbTrainerUser = await prisma.user.upsert({
    where: { email: 'priya@sector7.com' },
    update: {},
    create: {
      email: 'priya@sector7.com',
      passwordHash: pw,
      firstName: 'Priya',
      lastName: 'Menon',
      phone: '+91-9001000004',
      roles: ['KICKBOXING_TRAINER'],
      branchId: branch.id,
      isActive: true,
    },
  });
  const kbProfile = await prisma.trainerProfile.upsert({
    where: { userId: kbTrainerUser.id },
    update: {},
    create: {
      userId: kbTrainerUser.id,
      branchId: branch.id,
      specialties: ['kickboxing', 'MMA', 'self-defense'],
      certifications: ['ISSA-CPT', 'Kickboxing Instructor L3'],
      bio: 'National kickboxing champion, 5 years teaching experience.',
      workingHoursStart: '16:00',
      workingHoursEnd: '21:00',
      workingDays: ['MONDAY', 'WEDNESDAY', 'FRIDAY', 'SATURDAY'] as DayOfWeek[],
    },
  });
  console.log(`Kickboxing Trainer: priya@sector7.com / password123`);

  // Create kickboxing classes
  const kbDays = ['MONDAY', 'WEDNESDAY', 'FRIDAY'] as const;
  for (const day of kbDays) {
    const existing = await prisma.kickboxingClass.findFirst({
      where: { branchId: branch.id, trainerProfileId: kbProfile.id, dayOfWeek: day },
    });
    if (!existing) {
      const klass = await prisma.kickboxingClass.create({
        data: {
          branchId: branch.id,
          trainerProfileId: kbProfile.id,
          name: `${day.charAt(0) + day.slice(1).toLowerCase()} 6PM Kickboxing`,
          dayOfWeek: day,
          startTime: '18:00',
          durationMin: 60,
          maxCapacity: 15,
          isActive: true,
        },
      });
      // Enroll 3 gym members and 2 externals
      for (let i = 0; i < 3 && i < clients.length; i++) {
        await prisma.kickboxingEnrollment.create({
          data: {
            classId: klass.id,
            branchId: branch.id,
            clientType: 'GYM_MEMBER',
            clientProfileId: clients[i]!.profileId,
          },
        });
      }
      for (let i = 0; i < 2; i++) {
        await prisma.kickboxingEnrollment.create({
          data: {
            classId: klass.id,
            branchId: branch.id,
            clientType: 'EXTERNAL_ONLY',
            externalName: i === 0 ? 'Vikram Singh' : 'Neha Kapoor',
            externalPhone: `+91-900300000${i + 1}`,
          },
        });
      }
    }
  }
  console.log(`Kickboxing: 3 classes (Mon/Wed/Fri) with enrollments`);

  // ─── Audit Log Entries ───────────────────────────────
  // Seed a few audit log entries so the audit log page has data
  const auditActions = [
    { action: 'USER_CREATED', subjectType: 'User', subjectId: clients[0]!.id },
    { action: 'PT_PACKAGE_CREATED', subjectType: 'PtPackage', subjectId: 'seed-pkg-1' },
    { action: 'SESSION_STARTED', subjectType: 'SessionInstance', subjectId: 'seed-session-1' },
    { action: 'SESSION_COMPLETED', subjectType: 'SessionInstance', subjectId: 'seed-session-1' },
    { action: 'WORKOUT_LOGGED', subjectType: 'SessionInstance', subjectId: 'seed-session-1' },
    { action: 'SETTINGS_UPDATED', subjectType: 'BranchSettings', subjectId: branch.id },
  ];
  for (const a of auditActions) {
    await prisma.auditLog.create({
      data: {
        branchId: branch.id,
        actorId: admin.id,
        action: a.action,
        subjectType: a.subjectType,
        subjectId: a.subjectId,
      },
    });
  }
  console.log(`Audit log: ${auditActions.length} sample entries`);

  // ─── Summary ─────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log('Seed complete! All passwords: password123');
  console.log('='.repeat(50));
  console.log('\nAdmin:');
  console.log(`  admin@sector7.com`);
  console.log('\nTrainers:');
  for (const t of trainerData) {
    console.log(`  ${t.email} (${t.firstName} ${t.lastName})`);
  }
  console.log(`  priya@sector7.com (Priya Menon) [Kickboxing]`);
  console.log('\nClients:');
  for (const c of clientData) {
    console.log(`  ${c.email} (${c.firstName} ${c.lastName})`);
  }
  console.log(`\nTotal: 1 admin, ${trainerData.length + 1} trainers, ${clientData.length} clients`);
  console.log(`Mappings: ${mappings.length} trainer-client packages`);
  console.log(`Schedules: ${scheduleConfig.length} recurring schedules`);
  console.log(`Sessions: ${completedCount} completed, ${noShowCount} no-shows`);
  console.log(`Exercises: ${exercises.length} in library`);
  console.log(`Kickboxing: 3 classes, 5 enrollments each`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
