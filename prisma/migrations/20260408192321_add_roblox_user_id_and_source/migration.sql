/*
  Warnings:

  - A unique constraint covering the columns `[robloxUserId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Outfit" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'website';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "robloxUserId" BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "User_robloxUserId_key" ON "User"("robloxUserId");
