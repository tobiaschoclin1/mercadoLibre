/*
  Warnings:

  - A unique constraint covering the columns `[mercadolibreUserId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mercadolibreAccessToken" TEXT,
ADD COLUMN     "mercadolibreRefreshToken" TEXT,
ADD COLUMN     "mercadolibreTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "mercadolibreUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_mercadolibreUserId_key" ON "User"("mercadolibreUserId");
