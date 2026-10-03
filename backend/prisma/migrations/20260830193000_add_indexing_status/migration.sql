-- Add the persisted embedding lifecycle state used by the API and UI.
ALTER TYPE "RepoStatus" ADD VALUE IF NOT EXISTS 'INDEXING';
