// src/app/api/products/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session_token')?.value;

    if (!token) {
      return NextResponse.json({ message: 'No autenticado' }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const userId = payload.userId as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        mercadolibreId: true,
        mercadolibreAccessToken: true,
      },
    });

    if (!user?.mercadolibreId || !user.mercadolibreAccessToken) {
      return NextResponse.json(
        { message: 'MercadoLibre no está conectado' },
        { status: 400 }
      );
    }

  // Paginación
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

    const itemsRes = await fetch(
      `https://api.mercadolibre.com/users/${user.mercadolibreId}/items/search?status=active&offset=${offset}&limit=${limit}`,
      {
        headers: { Authorization: `Bearer ${user.mercadolibreAccessToken}` },
      }
    );
    if (!itemsRes.ok) {
      return NextResponse.json(
        { message: 'Error al obtener items' },
        { status: itemsRes.status }
      );
    }
    const itemsData = await itemsRes.json();
    const ids: string[] = itemsData?.results ?? [];
    const total: number = itemsData?.paging?.total ?? ids.length;
    if (ids.length === 0) {
      return NextResponse.json({ items: [], total });
    }
    const detailsRes = await fetch(
      `https://api.mercadolibre.com/items?ids=${ids.join(',')}`,
      {
        headers: { Authorization: `Bearer ${user.mercadolibreAccessToken}` },
      }
    );
    if (!detailsRes.ok) {
      return NextResponse.json(
        { message: 'Error al obtener detalles' },
        { status: detailsRes.status }
      );
    }
    const detailsData = await detailsRes.json();
    const mapped = detailsData
      .filter(
        (d: { code: number; body?: Record<string, unknown> }) =>
          d.code === 200 && d.body
      )
      .map((d: {
        body: {
          id: string;
          title: string;
          price: number;
          thumbnail: string;
          available_quantity: number;
        };
      }) => ({
        id: d.body.id,
        title: d.body.title,
        price: d.body.price,
        thumbnail: d.body.thumbnail,
        available_quantity: d.body.available_quantity,
      }));
    return NextResponse.json({ items: mapped, total }, { status: 200 });
  } catch (error) {
    console.error('Error al obtener productos:', error);
    return NextResponse.json({ message: 'Error en el servidor' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}