import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface TiendaNubeCustomer {
  id: number;
  email?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  orders_count?: number;
  phone?: string | null;
  default_address?: {
    province?: string | null;
  } | null;
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session_token")?.value;
    if (!sessionToken) {
      return NextResponse.json({ message: "No autenticado" }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(sessionToken, secret);
    const userId = payload.userId as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        tiendanubeStoreId: true,
        tiendanubeAccessToken: true,
      },
    });

    if (!user?.tiendanubeStoreId || !user.tiendanubeAccessToken) {
      return NextResponse.json({ message: "Usuario no conectado a Tienda Nube" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Number(searchParams.get("limit") ?? 20));
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));
    const perPage = Math.min(limit, 100);
    const page = Math.floor(offset / perPage) + 1;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": process.env.TIENDANUBE_USER_AGENT || "Fiddo-App (support@fiddo.app)",
      Authentication: `bearer ${user.tiendanubeAccessToken}`,
      Authorization: `Bearer ${user.tiendanubeAccessToken}`,
    };

    const apiUrl = new URL(`https://api.tiendanube.com/v1/${user.tiendanubeStoreId}/customers`);
    apiUrl.searchParams.set("per_page", String(perPage));
    apiUrl.searchParams.set("page", String(page));
    apiUrl.searchParams.set("sort", "orders_count:desc");

    const tnResponse = await fetch(apiUrl, { headers, cache: "no-store" });
    if (!tnResponse.ok) {
      console.error("Error Tienda Nube customers", tnResponse.status, await tnResponse.text());
      return NextResponse.json({ message: "No se pudieron obtener los clientes" }, { status: 502 });
    }

    const customers = (await tnResponse.json()) as TiendaNubeCustomer[];
    const totalHeader = tnResponse.headers.get("X-Total-Count") ?? tnResponse.headers.get("x-total-count");
    const total = totalHeader ? Number(totalHeader) : customers.length;

    const items = customers.map((customer) => ({
      id: String(customer.id),
      nickname: customer.name || customer.email || `Cliente ${customer.id}`,
      firstName: customer.first_name || null,
      lastName: customer.last_name || null,
      email: customer.email || null,
      province: customer.default_address?.province || null,
      purchaseCount: customer.orders_count ?? 0,
    }));

    return NextResponse.json({ items, total });
  } catch (error) {
    console.error("Error obteniendo compradores de Tienda Nube:", error);
    return NextResponse.json({ message: "Error interno" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
