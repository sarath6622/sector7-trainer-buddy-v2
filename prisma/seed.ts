import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ─── Branch ─────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { id: 'branch-main' },
    update: {},
    create: {
      id: 'branch-main',
      name: 'Sector 7 Main',
      address: '123 Fitness Avenue, Bangalore',
      phone: '+91-9876543210',
      email: 'main@sector7.fitness',
      isActive: true,
    },
  });
  console.log(`  Branch: ${branch.name} (${branch.id})`);

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
  console.log('  Branch settings created');

  // ─── Admin User ─────────────────────────────────────
  const adminPassword = await hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@sector7.com' },
    update: {},
    create: {
      email: 'admin@sector7.com',
      passwordHash: adminPassword,
      firstName: 'Sarath',
      lastName: 'Admin',
      phone: '+91-9876543210',
      role: 'BRANCH_ADMIN',
      branchId: branch.id,
      isActive: true,
    },
  });
  console.log(`  Admin: ${admin.email} / admin123`);

  // ─── Trainer User ───────────────────────────────────
  const trainerPassword = await hash('trainer123', 12);
  const trainer = await prisma.user.upsert({
    where: { email: 'trainer@sector7.com' },
    update: {},
    create: {
      email: 'trainer@sector7.com',
      passwordHash: trainerPassword,
      firstName: 'Ravi',
      lastName: 'Trainer',
      phone: '+91-9876543211',
      role: 'TRAINER',
      branchId: branch.id,
      isActive: true,
    },
  });

  await prisma.trainerProfile.upsert({
    where: { userId: trainer.id },
    update: {},
    create: {
      userId: trainer.id,
      branchId: branch.id,
      specialties: ['strength', 'cardio', 'HIIT'],
      certifications: ['ACE-CPT', 'NASM-CES'],
      bio: 'Experienced personal trainer specializing in strength and conditioning.',
      workingHoursStart: '06:00',
      workingHoursEnd: '20:00',
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
    },
  });
  console.log(`  Trainer: ${trainer.email} / trainer123`);

  // ─── Client User ────────────────────────────────────
  const clientPassword = await hash('client123', 12);
  const client = await prisma.user.upsert({
    where: { email: 'client@sector7.com' },
    update: {},
    create: {
      email: 'client@sector7.com',
      passwordHash: clientPassword,
      firstName: 'Priya',
      lastName: 'Client',
      phone: '+91-9876543212',
      role: 'CLIENT',
      branchId: branch.id,
      isActive: true,
    },
  });

  await prisma.clientProfile.upsert({
    where: { userId: client.id },
    update: {},
    create: {
      userId: client.id,
      branchId: branch.id,
      height: 165,
      currentWeight: 62,
      bodyFatPercentage: 22,
      fitnessGoals: 'Build strength and improve posture',
      emergencyContactName: 'Kumar',
      emergencyContactPhone: '+91-9876543213',
    },
  });
  console.log(`  Client: ${client.email} / client123`);

  // ─── Sample Exercises ───────────────────────────────
  const exercises = [
    {
      id: 'ex-bench-press',
      name: 'Bench Press',
      targetMuscleGroup: 'Chest',
      secondaryMuscles: ['Triceps', 'Shoulders'],
      equipmentRequired: 'Barbell, Bench',
      difficulty: 'MEDIUM' as const,
      category: 'HYPERTROPHY' as const,
      instructions: 'Lie on bench, grip barbell shoulder-width, lower to chest, press up.',
    },
    {
      id: 'ex-squat',
      name: 'Squat',
      targetMuscleGroup: 'Quadriceps',
      secondaryMuscles: ['Glutes', 'Hamstrings', 'Core'],
      equipmentRequired: 'Barbell, Squat Rack',
      difficulty: 'MEDIUM' as const,
      category: 'STRENGTH' as const,
      instructions: 'Stand with barbell on upper back, squat down to parallel, drive up.',
    },
    {
      id: 'ex-deadlift',
      name: 'Deadlift',
      targetMuscleGroup: 'Back',
      secondaryMuscles: ['Hamstrings', 'Glutes', 'Core'],
      equipmentRequired: 'Barbell',
      difficulty: 'HARD' as const,
      category: 'STRENGTH' as const,
      instructions: 'Stand over barbell, hinge at hips, grip bar, drive through floor to stand.',
    },
    {
      id: 'ex-pullup',
      name: 'Pull-up',
      targetMuscleGroup: 'Back',
      secondaryMuscles: ['Biceps', 'Core'],
      equipmentRequired: 'Pull-up Bar',
      difficulty: 'HARD' as const,
      category: 'HYPERTROPHY' as const,
      instructions: 'Hang from bar, pull chin above bar, lower with control.',
    },
    {
      id: 'ex-plank',
      name: 'Plank',
      targetMuscleGroup: 'Core',
      secondaryMuscles: ['Shoulders', 'Glutes'],
      equipmentRequired: 'None',
      difficulty: 'EASY' as const,
      category: 'FUNCTIONAL' as const,
      instructions: 'Hold push-up position on forearms, keep body straight, engage core.',
    },
  ];

  for (const ex of exercises) {
    await prisma.exercise.upsert({
      where: { id: ex.id },
      update: {},
      create: ex,
    });
  }
  console.log(`  Exercises: ${exercises.length} created`);

  console.log('\nSeed complete! Test credentials:');
  console.log('  Admin:   admin@sector7.com   / admin123');
  console.log('  Trainer: trainer@sector7.com  / trainer123');
  console.log('  Client:  client@sector7.com   / client123');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
