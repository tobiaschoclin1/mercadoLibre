import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface TiendaNubeProduct {
  id: number;
  name: string;
  images?: { src: string }[];
  variants?: Array<{
    price?: string;
    promotional_price?: string | null;
    stock?: number | null;
  }>;
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

    const apiUrl = new URL(`https://api.tiendanube.com/v1/${user.tiendanubeStoreId}/products`);
    apiUrl.searchParams.set("per_page", String(perPage));
    apiUrl.searchParams.set("page", String(page));
    apiUrl.searchParams.set("fields", "id,name,images,variants");

    const tnResponse = await fetch(apiUrl, { headers, cache: "no-store" });
    if (!tnResponse.ok) {
      console.error("Error Tienda Nube products", tnResponse.status, await tnResponse.text());
      return NextResponse.json({ message: "No se pudieron obtener los productos" }, { status: 502 });
    }

    const products = (await tnResponse.json()) as TiendaNubeProduct[];
    const totalHeader = tnResponse.headers.get("X-Total-Count") ?? tnResponse.headers.get("x-total-count");
    const total = totalHeader ? Number(totalHeader) : products.length;

    const items = products.map((product) => {
      const variant = product.variants?.[0];
      const price = variant?.promotional_price || variant?.price || "0";
      const stock = variant?.stock ?? 0;
      const thumbnail = product.images?.[0]?.src ?? "/brand/Fiddo.JPG";
      const parsedPrice = Number(price);
      const parsedStock = typeof stock === "number" ? stock : Number(stock ?? 0);
      return {
        id: String(product.id),
        title: product.name,
        price: Number.isNaN(parsedPrice) ? 0 : parsedPrice,
        thumbnail,
        available_quantity: Number.isNaN(parsedStock) ? 0 : parsedStock,
      };
    });

    return NextResponse.json({ items, total });
  } catch (error) {
    console.error("Error obteniendo productos de Tienda Nube:", error);
    return NextResponse.json({ message: "Error interno" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
