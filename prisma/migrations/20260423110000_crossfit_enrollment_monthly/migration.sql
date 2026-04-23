-- Make classId optional on crossfit_enrollments (monthly/program enrollment, not per-class)
ALTER TABLE "crossfit_enrollments" ALTER COLUMN "classId" DROP NOT NULL;
