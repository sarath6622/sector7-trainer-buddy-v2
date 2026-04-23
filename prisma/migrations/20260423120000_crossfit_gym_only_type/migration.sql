-- Add GYM_ONLY to KickboxingClientType enum (gym member without PT, CrossFit-only)
ALTER TYPE "KickboxingClientType" ADD VALUE IF NOT EXISTS 'GYM_ONLY';
