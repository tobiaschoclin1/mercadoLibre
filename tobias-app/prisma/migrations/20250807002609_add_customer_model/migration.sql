/*
  Warnings:

  - You are about to drop the column `mercadolibreUserId` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[mercadolibreOrderId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mercadolibreId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `customerId` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mercadolibreOrderId` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orderDate` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "User_mercadolibreUserId_key";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerId" TEXT NOT NULL,
ADD COLUMN     "mercadolibreOrderId" BIGINT NOT NULL,
ADD COLUMN     "orderDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "status" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "mercadolibreUserId",
ADD COLUMN     "mercadolibreId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "mercadolibreId" BIGINT NOT NULL,
    "nickname" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_mercadolibreId_key" ON "Customer"("mercadolibreId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Order_mercadolibreOrderId_key" ON "Order"("mercadolibreOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "User_mercadolibreId_key" ON "User"("mercadolibreId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
