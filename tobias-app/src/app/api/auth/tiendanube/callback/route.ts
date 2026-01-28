import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const storeId = url.searchParams.get("store_id");
  const error = url.searchParams.get("error");

  if (error) {
    const redirectUrl = new URL("/(dashboard)/dashboard", request.url);
    redirectUrl.searchParams.set("tiendanube_error", error);
    return NextResponse.redirect(redirectUrl);
  }

  if (!code || !storeId) {
    const redirectUrl = new URL("/(dashboard)/dashboard", request.url);
    redirectUrl.searchParams.set("tiendanube_error", "MissingCode");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session_token")?.value;
    if (!sessionToken) {
      const redirectUrl = new URL("/login", request.url);
      return NextResponse.redirect(redirectUrl);
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(sessionToken, secret);
    const userId = payload.userId as string;

    const clientId = process.env.TIENDANUBE_CLIENT_ID;
    const clientSecret = process.env.TIENDANUBE_CLIENT_SECRET;
    const redirectUri = process.env.NEXT_PUBLIC_TIENDANUBE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      const redirectUrl = new URL("/(dashboard)/dashboard", request.url);
      redirectUrl.searchParams.set("tiendanube_error", "MissingConfiguration");
      return NextResponse.redirect(redirectUrl);
    }

    const tokenResponse = await fetch("https://www.tiendanube.com/apps/authorize/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const redirectUrl = new URL("/(dashboard)/dashboard", request.url);
      redirectUrl.searchParams.set("tiendanube_error", "TokenRequestFailed");
      return NextResponse.redirect(redirectUrl);
    }

    const tokenData: {
      access_token: string;
      token_type?: string;
      scope?: string;
      user_id?: number;
      store_id?: number;
    } = await tokenResponse.json();

    await prisma.user.update({
      where: { id: userId },
      data: {
        tiendanubeStoreId: String(tokenData.store_id ?? storeId),
        tiendanubeUserId: tokenData.user_id ? String(tokenData.user_id) : null,
        tiendanubeAccessToken: tokenData.access_token,
        tiendanubeTokenType: tokenData.token_type,
        tiendanubeScope: tokenData.scope,
      },
    });

    const redirectUrl = new URL("/(dashboard)/dashboard", request.url);
    redirectUrl.searchParams.set("tiendanube_success", "true");
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("Error en callback de Tienda Nube:", err);
    const redirectUrl = new URL("/(dashboard)/dashboard", request.url);
    redirectUrl.searchParams.set("tiendanube_error", "ServerError");
    return NextResponse.redirect(redirectUrl);
  } finally {
    await prisma.$disconnect();
  }
}
