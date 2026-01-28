import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session_token")?.value;

    if (!sessionToken) {
      return NextResponse.json({ message: "No autenticado" }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(sessionToken, secret);
    const userId = payload.userId as string;

    await prisma.user.update({
      where: { id: userId },
      data: {
        tiendanubeStoreId: null,
        tiendanubeUserId: null,
        tiendanubeAccessToken: null,
        tiendanubeTokenType: null,
        tiendanubeScope: null,
      },
    });

    return NextResponse.json({ message: "Cuenta de Tienda Nube desconectada" });
  } catch (error) {
    console.error("Error al desconectar Tienda Nube:", error);
    return NextResponse.json({ message: "Error al desconectar" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
