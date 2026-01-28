"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import Image from "next/image";

// --- Funciones para PKCE ---
function base64URLEncode(str: Buffer) {
  return str.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
async function generateCodeChallenge(verifier: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return base64URLEncode(Buffer.from(digest));
}

interface UserProfile {
  user: { id: string; name: string; email: string; createdAt: string };
  mercadolibre: {
    connected: boolean;
    userId?: string;
    expiresAt?: string;
    profile?: {
      nickname: string;
      first_name: string;
      last_name: string;
      email: string;
      permalink: string;
    };
  };
  tiendanube: {
    connected: boolean;
    storeId?: string;
    userId?: string;
    scope?: string;
    tokenType?: string;
    profile?: {
      name?: string;
      domain?: string;
      email?: string;
    } | null;
  };
}
interface Customer {
  id: string;
  mercadolibreId: string;
  nickname: string;
  firstName?: string | null;
  lastName?: string | null;
  purchaseCount: number;
  lastOrderId?: string | null;
  lastShippingMethod?: string | null;
  province?: string | null;
}
interface MLProduct {
  id: string;
  title: string;
  price: number;
  thumbnail: string;
  available_quantity: number;
}

interface TNCustomer {
  id: string;
  nickname: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  province?: string | null;
  purchaseCount: number;
}

interface TNProduct {
  id: string;
  title: string;
  price: number;
  thumbnail: string;
  available_quantity: number;
}

export default function DashboardPage() {
  // Paginación productos
  const PRODUCTS_PER_PAGE = 10;
  const [productsPage] = useState(1);
  // Paginación compradores
  const CUSTOMERS_PER_PAGE = 20;
  const [customersPage, setCustomersPage] = useState(1);
  const router = useRouter();
  const { notify } = useToast();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [purchaseFilter, setPurchaseFilter] = useState("");
  const [provinceFilter, setProvinceFilter] = useState("");
  const [availableProvinces, setAvailableProvinces] = useState<string[]>([]);
  const [products, setProducts] = useState<MLProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [promotionData, setPromotionData] = useState<Record<string, { link: string; promotionId: string; expiresAt: string }>>({});
  const [messageModal, setMessageModal] = useState<{ open: boolean; customer?: Customer; text: string }>({ open: false, text: "" });
  const [bulkModal, setBulkModal] = useState<{ open: boolean; text: string }>({ open: false, text: "" });
  const [promotionModal, setPromotionModal] = useState<{ open: boolean; productId?: string; discount: string; days: string }>({ open: false, discount: "", days: "" });
  const [disconnectModal, setDisconnectModal] = useState(false);
  const TN_PRODUCTS_PER_PAGE = 10;
  const tnProductsPage = 1;
  const TN_CUSTOMERS_PER_PAGE = 20;
  const [tnCustomersPage, setTnCustomersPage] = useState(1);
  const [tnCustomers, setTnCustomers] = useState<TNCustomer[]>([]);
  const [tnCustomersLoading, setTnCustomersLoading] = useState(true);
  const [tnPurchaseFilter, setTnPurchaseFilter] = useState("");
  const [tnProvinceFilter, setTnProvinceFilter] = useState("");
  const [tnAvailableProvinces, setTnAvailableProvinces] = useState<string[]>([]);
  const [tnProducts, setTnProducts] = useState<TNProduct[]>([]);
  const [tnProductsLoading, setTnProductsLoading] = useState(true);
  const [tnDisconnectModal, setTnDisconnectModal] = useState(false);
  // MercadoLibre
  const mlAppId = process.env.NEXT_PUBLIC_MERCADOLIBRE_APP_ID;
  const mlRedirectUri = process.env.NEXT_PUBLIC_MERCADOLIBRE_REDIRECT_URI;
  // Tienda Nube
  const tnAppId = process.env.NEXT_PUBLIC_TIENDANUBE_APP_ID;
  const tnClientId = process.env.NEXT_PUBLIC_TIENDANUBE_CLIENT_ID || tnAppId;
  const tnRedirectUri = process.env.NEXT_PUBLIC_TIENDANUBE_REDIRECT_URI;
  const tnScopes = process.env.NEXT_PUBLIC_TIENDANUBE_SCOPES || "read_customers read_products";

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      let match = true;
      if (purchaseFilter === "1") match = match && c.purchaseCount === 1;
      else if (purchaseFilter === "1-5") match = match && c.purchaseCount > 1 && c.purchaseCount <= 5;
      else if (purchaseFilter === "5-10") match = match && c.purchaseCount > 5 && c.purchaseCount <= 10;
      else if (purchaseFilter === "10+") match = match && c.purchaseCount > 10;
      if (provinceFilter) match = match && c.province === provinceFilter;
      return match;
    });
  }, [customers, purchaseFilter, provinceFilter]);

  const tnFilteredCustomers = useMemo(() => {
    return tnCustomers.filter((c) => {
      let match = true;
      if (tnPurchaseFilter === "1") match = match && c.purchaseCount === 1;
      else if (tnPurchaseFilter === "1-5") match = match && c.purchaseCount > 1 && c.purchaseCount <= 5;
      else if (tnPurchaseFilter === "5-10") match = match && c.purchaseCount > 5 && c.purchaseCount <= 10;
      else if (tnPurchaseFilter === "10+") match = match && c.purchaseCount > 10;
      if (tnProvinceFilter) match = match && c.province === tnProvinceFilter;
      return match;
    });
  }, [tnCustomers, tnPurchaseFilter, tnProvinceFilter]);

  // 1. Cargar perfil de usuario solo al montar
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await fetch("/api/user/profile");
        if (response.ok) {
          const data = await response.json();
          setUserProfile(data);
        }
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUserProfile();
    // Verificar si hay mensajes de error o éxito en la URL
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");
    const success = urlParams.get("success");
    const tnError = urlParams.get("tiendanube_error");
    const tnSuccess = urlParams.get("tiendanube_success");
    if (error === "MLAccountAlreadyLinked") {
      notify("⚠️ Esta cuenta de MercadoLibre ya está conectada a otro usuario. Por favor, usa una cuenta diferente.");
    } else if (error === "TokenError") {
      notify("❌ Error al conectar con MercadoLibre. Por favor, inténtalo de nuevo.");
    } else if (success === "true") {
      notify("✅ ¡Conexión con MercadoLibre exitosa!");
      fetchUserProfile();
    }
    if (tnError) {
      notify("❌ Error al conectar con Tienda Nube. Por favor, revisa la configuración e inténtalo nuevamente.");
    } else if (tnSuccess === "true") {
      notify("✅ ¡Conexión con Tienda Nube exitosa!");
      fetchUserProfile();
    }
    if (error || success || tnError || tnSuccess) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [notify]);

  // 2. Cargar compradores cuando userProfile cambia y está conectado
  useEffect(() => {
    if (!userProfile?.mercadolibre.connected) return;
    const fetchCustomers = async () => {
      setCustomersLoading(true);
      try {
        const offset = (customersPage - 1) * CUSTOMERS_PER_PAGE;
        const response = await fetch(`/api/customers?limit=${CUSTOMERS_PER_PAGE}&offset=${offset}`);
        if (response.ok) {
          const data = await response.json();
          setCustomers(data.items);
          const provs = Array.from(new Set(data.items.map((c: Customer) => c.province).filter((p: string | null): p is string => Boolean(p)))).sort();
          setAvailableProvinces(provs as string[]);
        } else {
          console.error("Error cargando clientes");
        }
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setCustomersLoading(false);
      }
    };
    fetchCustomers();
  }, [userProfile, customersPage]);

  useEffect(() => {
    const fetchProducts = async () => {
      setProductsLoading(true);
      try {
        const offset = (productsPage - 1) * PRODUCTS_PER_PAGE;
        const response = await fetch(`/api/products?limit=${PRODUCTS_PER_PAGE}&offset=${offset}`);
        if (!response.ok) throw new Error("Error al obtener productos");
        const data = await response.json();
        setProducts(data.items);
      } catch (error) {
        console.error("Error al obtener productos:", error);
      } finally {
        setProductsLoading(false);
      }
    };
    if (userProfile?.mercadolibre.connected) {
      fetchProducts();
    }
  }, [userProfile, productsPage]);

  useEffect(() => {
    if (!userProfile?.tiendanube.connected) return;
    const fetchCustomers = async () => {
      setTnCustomersLoading(true);
      try {
        const offset = (tnCustomersPage - 1) * TN_CUSTOMERS_PER_PAGE;
        const response = await fetch(`/api/tiendanube/customers?limit=${TN_CUSTOMERS_PER_PAGE}&offset=${offset}`);
        if (response.ok) {
          const data = await response.json();
          setTnCustomers(data.items);
          const provs = Array.from(new Set(data.items.map((c: TNCustomer) => c.province).filter((p: string | null): p is string => Boolean(p)))).sort();
          setTnAvailableProvinces(provs as string[]);
        } else {
          console.error("Error cargando clientes de Tienda Nube");
        }
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setTnCustomersLoading(false);
      }
    };
    fetchCustomers();
  }, [userProfile, tnCustomersPage]);

  useEffect(() => {
    if (!userProfile?.tiendanube.connected) return;
    const fetchProducts = async () => {
      setTnProductsLoading(true);
      try {
        const offset = (tnProductsPage - 1) * TN_PRODUCTS_PER_PAGE;
        const response = await fetch(`/api/tiendanube/products?limit=${TN_PRODUCTS_PER_PAGE}&offset=${offset}`);
        if (!response.ok) throw new Error("Error al obtener productos de Tienda Nube");
        const data = await response.json();
        setTnProducts(data.items);
      } catch (error) {
        console.error("Error al obtener productos de Tienda Nube:", error);
      } finally {
        setTnProductsLoading(false);
      }
    };
    fetchProducts();
  }, [userProfile, tnProductsPage]);

  // Handlers para los modales y acciones
  const handleSendMessage = async () => {
    if (!messageModal.customer || !messageModal.text) return;
    try {
      const response = await fetch(`/api/customers/${messageModal.customer.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageModal.text, orderId: messageModal.customer.lastOrderId }),
      });
      if (response.ok) {
        notify("Mensaje enviado");
      } else {
        notify("No se pudo enviar el mensaje");
      }
    } catch (error) {
      console.error("Error al enviar mensaje individual:", error);
      notify("No se pudo enviar el mensaje");
    } finally {
      setMessageModal({ open: false, customer: undefined, text: "" });
    }
  };
  const handleSendBulk = async () => {
    if (!bulkModal.text) return;
    try {
      const responses = await Promise.all(
        filteredCustomers.map((customer) =>
          fetch(`/api/customers/${customer.id}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: bulkModal.text, orderId: customer.lastOrderId }),
          })
        )
      );
      const failed = responses.filter((r) => !r.ok);
      if (failed.length > 0) {
        notify(`Mensajes enviados con ${failed.length} errores.`);
      } else {
        notify("Mensajes enviados");
      }
    } catch (error) {
      console.error("Error al enviar mensajes masivos:", error);
      notify("No se pudieron enviar los mensajes");
    } finally {
      setBulkModal({ open: false, text: "" });
    }
  };
  const handleApplyPromotion = async () => {
    const discount = Number(promotionModal.discount);
    const days = Number(promotionModal.days);
    if (!promotionModal.productId || isNaN(discount) || discount <= 0 || isNaN(days) || days <= 0) {
      notify("Datos inválidos");
      return;
    }
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    try {
      const res = await fetch(`/api/products/${promotionModal.productId}/promotion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discount, expiresAt }),
      });
      let data: { permalink?: string; promotionId?: string; expiresAt?: string; message?: string; details?: string } = {};
      try { data = await res.json(); } catch { data = {}; }
      if (!res.ok) {
        notify(`${data.message || "No se pudo aplicar la promoción"}${data.details ? `: ${data.details}` : ""}`);
        return;
      }
      if (data.permalink && data.promotionId && data.expiresAt) {
        setPromotionData((prev) => ({
          ...prev,
          [promotionModal.productId as string]: {
            link: data.permalink!,
            promotionId: data.promotionId!,
            expiresAt: data.expiresAt!,
          },
        }));
      }
      notify("Promoción aplicada");
    } catch (error) {
      console.error("Error al aplicar la promoción:", error);
      notify("No se pudo aplicar la promoción");
    } finally {
      setPromotionModal({ open: false, productId: undefined, discount: "", days: "" });
    }
  };
  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    notify("Link copiado");
  };
  const handleMercadoLibreDisconnect = () => setDisconnectModal(true);
  const confirmDisconnect = async () => {
    try {
      const response = await fetch("/api/auth/mercadolibre/disconnect", { method: "POST" });
      if (response.ok) {
        notify("Cuenta de MercadoLibre desconectada exitosamente");
        const profileResponse = await fetch("/api/user/profile");
        if (profileResponse.ok) {
          const data = await profileResponse.json();
          setUserProfile(data);
        }
      } else {
        notify("Error al desconectar la cuenta");
      }
    } catch (error) {
      console.error("Error al desconectar MercadoLibre:", error);
      notify("Error al desconectar la cuenta");
    } finally {
      setDisconnectModal(false);
    }
  };
  const handleTiendaNubeDisconnect = () => setTnDisconnectModal(true);
  const confirmTiendaNubeDisconnect = async () => {
    try {
      const response = await fetch("/api/auth/tiendanube/disconnect", { method: "POST" });
      if (response.ok) {
        notify("Cuenta de Tienda Nube desconectada exitosamente");
        const profileResponse = await fetch("/api/user/profile");
        if (profileResponse.ok) {
          const data = await profileResponse.json();
          setUserProfile(data);
        }
      } else {
        notify("Error al desconectar la cuenta de Tienda Nube");
      }
    } catch (error) {
      console.error("Error al desconectar Tienda Nube:", error);
      notify("Error al desconectar la cuenta de Tienda Nube");
    } finally {
      setTnDisconnectModal(false);
    }
  };
  function handleMercadoLibreConnect() {
    const codeVerifier = base64URLEncode(Buffer.from(window.crypto.getRandomValues(new Uint8Array(32))));
    generateCodeChallenge(codeVerifier).then((codeChallenge) => {
      document.cookie = `pkce_code_verifier=${codeVerifier}; path=/; max-age=300; SameSite=Lax`;
      const params = new URLSearchParams({
        response_type: "code",
        client_id: mlAppId!,
        redirect_uri: mlRedirectUri!,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });
      const authUrl = `https://auth.mercadolibre.com.ar/authorization?${params.toString()}`;
      window.location.href = authUrl;
    });
  }
  const handleTiendaNubeConnect = () => {
    if (!tnAppId || !tnClientId || !tnRedirectUri) {
      notify("Configura las credenciales de Tienda Nube antes de continuar.");
      return;
    }
    const state = base64URLEncode(Buffer.from(window.crypto.getRandomValues(new Uint8Array(16))));
    document.cookie = `tiendanube_state=${state}; path=/; max-age=300; SameSite=Lax`;
    const authorizeBase = `https://www.tiendanube.com/apps/${tnAppId}/authorize`;
    const params = new URLSearchParams({
      client_id: tnClientId,
      response_type: "code",
      redirect_uri: tnRedirectUri,
      scope: tnScopes,
      state,
    });
    window.location.href = `${authorizeBase}?${params.toString()}`;
  };
  const handleLogout = async () => {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (response.ok) {
        router.push("/login");
      } else {
        console.error("Falló el cierre de sesión en el servidor");
      }
    } catch (error) {
      console.error("Error al intentar cerrar sesión:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fiddo-blue mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Modales */}
      <Modal
        title="Enviar mensaje"
        open={messageModal.open}
        onClose={() => setMessageModal({ open: false, customer: undefined, text: "" })}
        onConfirm={handleSendMessage}
        confirmText="Enviar"
      >
        <textarea
          className="w-full border rounded-xl p-2 mt-2"
          rows={4}
          value={messageModal.text}
          onChange={e => setMessageModal(m => ({ ...m, text: e.target.value }))}
          placeholder="Escribe el mensaje..."
        />
      </Modal>
      <Modal
        title="Enviar mensaje masivo"
        open={bulkModal.open}
        onClose={() => setBulkModal({ open: false, text: "" })}
        onConfirm={handleSendBulk}
        confirmText="Enviar"
      >
        <textarea
          className="w-full border rounded-xl p-2 mt-2"
          rows={4}
          value={bulkModal.text}
          onChange={e => setBulkModal(m => ({ ...m, text: e.target.value }))}
          placeholder="Mensaje para todos los compradores filtrados..."
        />
      </Modal>
      <Modal
        title="Aplicar promoción"
        open={promotionModal.open}
        onClose={() => setPromotionModal({ open: false, productId: undefined, discount: "", days: "" })}
        onConfirm={handleApplyPromotion}
        confirmText="Aplicar"
      >
        <div className="flex flex-col gap-2">
          <input
            className="border rounded-xl p-2"
            type="number"
            placeholder="Descuento (%)"
            value={promotionModal.discount}
            onChange={e => setPromotionModal(m => ({ ...m, discount: e.target.value }))}
          />
          <input
            className="border rounded-xl p-2"
            type="number"
            placeholder="Días de duración"
            value={promotionModal.days}
            onChange={e => setPromotionModal(m => ({ ...m, days: e.target.value }))}
          />
        </div>
      </Modal>
      <Modal
        title="Desconectar cuenta de MercadoLibre"
        open={disconnectModal}
        onClose={() => setDisconnectModal(false)}
        onConfirm={confirmDisconnect}
        confirmText="Desconectar"
      >
        ¿Estás seguro de que deseas desconectar tu cuenta de MercadoLibre?
      </Modal>
      <Modal
        title="Desconectar cuenta de Tienda Nube"
        open={tnDisconnectModal}
        onClose={() => setTnDisconnectModal(false)}
        onConfirm={confirmTiendaNubeDisconnect}
        confirmText="Desconectar"
      >
        ¿Estás seguro de que deseas desconectar tu cuenta de Tienda Nube?
      </Modal>

      {/* Dashboard principal */}
      <div className="min-h-screen bg-fiddo-blue/10 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Header del Dashboard */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <img src="/brand/Fiddo.JPG" alt="Fiddo Logo" style={{height: 48, width: 'auto', maxWidth: 80}} />
                <div>
                  <span className="font-bold text-2xl text-fiddo-blue">F</span><span className="font-bold text-2xl text-fiddo-orange">i</span><span className="font-bold text-2xl text-fiddo-turquoise">ddo</span>
                  <p className="text-gray-600 mt-1">¡Bienvenido, {userProfile?.user.name}!</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-md bg-fiddo-orange px-4 py-2 font-semibold text-white transition-colors hover:bg-fiddo-turquoise"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>

          {/* Integraciones */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Tienda Nube</h2>
              {userProfile?.tiendanube.connected ? (
                <div className="space-y-3">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                    <span className="text-green-700 font-medium">Conectado</span>
                  </div>
                  {userProfile.tiendanube.profile && (
                    <>
                      {userProfile.tiendanube.profile?.name && (
                        <div>
                          <span className="text-gray-600">Tienda:</span>
                          <span className="ml-2 font-medium">{userProfile.tiendanube.profile.name}</span>
                        </div>
                      )}
                      {userProfile.tiendanube.profile?.domain && (
                        <div>
                          <span className="text-gray-600">Dominio:</span>
                          <span className="ml-2 font-medium">{userProfile.tiendanube.profile.domain}</span>
                        </div>
                      )}
                    </>
                  )}
                  <button
                    onClick={handleTiendaNubeDisconnect}
                    className="w-full rounded-md bg-fiddo-orange/20 px-4 py-2 font-medium text-fiddo-orange transition-colors hover:bg-fiddo-orange/30"
                  >
                    Desconectar cuenta
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-gray-400 rounded-full mr-2"></div>
                    <span className="text-gray-600">No conectado</span>
                  </div>
                  <button
                    onClick={handleTiendaNubeConnect}
                    className="w-full rounded-md bg-fiddo-turquoise px-4 py-2 font-bold text-white transition-colors hover:bg-fiddo-blue"
                  >
                    Conectar con Tienda Nube
                  </button>
                </div>
              )}
            </div>

            {/* Estado de MercadoLibre */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">MercadoLibre</h2>
              {userProfile?.mercadolibre.connected ? (
                <div className="space-y-3">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                    <span className="text-green-700 font-medium">Conectado</span>
                  </div>
                  {userProfile.mercadolibre.profile && (
                    <>
                      <div>
                        <span className="text-gray-600">Usuario:</span>
                        <span className="ml-2 font-medium">{userProfile.mercadolibre.profile.nickname}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Nombre:</span>
                        <span className="ml-2 font-medium">
                          {userProfile.mercadolibre.profile.first_name} {userProfile.mercadolibre.profile.last_name}
                        </span>
                      </div>
                    </>
                  )}
                  <button
                    onClick={handleMercadoLibreDisconnect}
                    className="w-full rounded-md bg-fiddo-orange/20 px-4 py-2 font-medium text-fiddo-orange transition-colors hover:bg-fiddo-orange/30"
                  >
                    Desconectar cuenta
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-gray-400 rounded-full mr-2"></div>
                    <span className="text-gray-600">No conectado</span>
                  </div>
                  <button
                    onClick={handleMercadoLibreConnect}
                    className="w-full rounded-md bg-fiddo-turquoise px-4 py-2 font-bold text-white transition-colors hover:bg-fiddo-blue"
                  >
                    Conectar con MercadoLibre
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Listado de compradores */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Compradores</h2>
            <div className="flex flex-wrap items-center mb-4 gap-4">
              <div className="flex items-center">
                <label className="mr-2 text-sm text-gray-700">Compras:</label>
                <select
                  value={purchaseFilter}
                  onChange={(e) => setPurchaseFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="">Todas</option>
                  <option value="1">1 compra</option>
                  <option value="1-5">Entre 1 y 5</option>
                  <option value="5-10">Entre 5 y 10</option>
                  <option value="10+">Más de 10</option>
                </select>
              </div>
              <div className="flex items-center">
                <label className="mr-2 text-sm text-gray-700">Ubicación:</label>
                <select
                  value={provinceFilter}
                  onChange={(e) => setProvinceFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="">Todas</option>
                  {availableProvinces.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setBulkModal({ open: true, text: "" })}
                className="ml-auto rounded bg-fiddo-blue px-3 py-1 text-sm font-medium text-white hover:bg-fiddo-turquoise"
              >
                Enviar mensaje a todos
              </button>
            </div>
            {!userProfile?.mercadolibre.connected ? (
              <p className="text-gray-600">Usuario no conectado a Mercado Libre.</p>
            ) : customersLoading ? (
              <p className="text-gray-600">Cargando...</p>
            ) : (
              filteredCustomers.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">ID</th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Nickname</th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Nombre</th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Provincia</th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Compras</th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredCustomers
                          .slice((customersPage - 1) * CUSTOMERS_PER_PAGE, customersPage * CUSTOMERS_PER_PAGE)
                          .map((customer) => (
                            <tr key={customer.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-sm text-gray-900">{customer.mercadolibreId}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{customer.nickname}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">
                                {customer.firstName || customer.lastName
                                  ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
                                  : '-'}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-900">{customer.province || '-'}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{customer.purchaseCount}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">
                                <button
                                  className="rounded bg-fiddo-blue px-3 py-1 text-white text-xs"
                                  onClick={() => setMessageModal({ open: true, customer, text: '' })}
                                >
                                  Enviar mensaje
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Paginación compradores */}
                  <div className="flex justify-center items-center gap-2 mt-6">
                    <button
                      className="px-3 py-1 rounded bg-neutral-200 text-gray-700 disabled:opacity-50"
                      onClick={() => setCustomersPage((p) => Math.max(1, p - 1))}
                      disabled={customersPage === 1}
                    >Anterior</button>
                    {Array.from({ length: Math.ceil(filteredCustomers.length / CUSTOMERS_PER_PAGE) }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        className={`px-3 py-1 rounded ${n === customersPage ? 'bg-fiddo-orange text-white' : 'bg-neutral-100 text-gray-700'}`}
                        onClick={() => setCustomersPage(n)}
                        disabled={n === customersPage}
                      >{n}</button>
                    ))}
                    <button
                      className="px-3 py-1 rounded bg-neutral-200 text-gray-700 disabled:opacity-50"
                      onClick={() => setCustomersPage((p) => p + 1)}
                      disabled={customersPage === Math.ceil(filteredCustomers.length / CUSTOMERS_PER_PAGE) || filteredCustomers.length === 0}
                    >Siguiente</button>
                  </div>
                </>
              ) : (
                <p className="text-gray-600">No hay compradores.</p>
              )
            )}
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 mt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Productos</h2>
            {!userProfile?.mercadolibre.connected ? (
              <p className="text-gray-600">Usuario no conectado a Mercado Libre.</p>
            ) : productsLoading ? (
              <p className="text-gray-600">Cargando...</p>
            ) : (
              products.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="border rounded-lg overflow-hidden shadow hover:shadow-lg transition bg-white"
                    >
                      <div className="w-full h-40 flex items-center justify-center bg-white">
                        <Image
                          src={product.thumbnail}
                          alt={product.title}
                          width={300}
                          height={160}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <div className="p-4 flex flex-col gap-2 bg-neutral-100">
                        <div className="font-semibold text-gray-900">{product.title}</div>
                        <div className="text-fiddo-blue font-bold text-lg">${product.price}</div>
                        <div className="text-xs text-gray-500">Stock: {product.available_quantity}</div>
                        <button
                          onClick={() => setPromotionModal({ open: true, productId: product.id, discount: '', days: '' })}
                          className="rounded bg-fiddo-orange px-3 py-1 text-white mt-2"
                        >
                          Aplicar promoción
                        </button>
                        {promotionData[product.id] && (
                          <div className="mt-2 flex flex-col gap-2">
                            <a
                              href={promotionData[product.id].link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-fiddo-blue underline"
                            >
                              Ver promoción activa
                            </a>
                            <button
                              onClick={() => handleCopyLink(promotionData[product.id].link)}
                              className="rounded bg-fiddo-blue px-2 py-1 text-xs text-white"
                            >
                              Copiar link
                            </button>
                            <div className="text-xs text-gray-500">
                              Expira: {new Date(promotionData[product.id].expiresAt).toLocaleString()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">Aún no hay productos.</p>
              )
            )}
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 mt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Compradores (Tienda Nube)</h2>
            <div className="flex flex-wrap items-center mb-4 gap-4">
              <div className="flex items-center">
                <label className="mr-2 text-sm text-gray-700">Compras:</label>
                <select
                  value={tnPurchaseFilter}
                  onChange={(e) => setTnPurchaseFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="">Todas</option>
                  <option value="1">1 compra</option>
                  <option value="1-5">Entre 1 y 5</option>
                  <option value="5-10">Entre 5 y 10</option>
                  <option value="10+">Más de 10</option>
                </select>
              </div>
              <div className="flex items-center">
                <label className="mr-2 text-sm text-gray-700">Ubicación:</label>
                <select
                  value={tnProvinceFilter}
                  onChange={(e) => setTnProvinceFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="">Todas</option>
                  {tnAvailableProvinces.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => notify("La mensajería masiva aún no está disponible para Tienda Nube.")}
                className="ml-auto rounded bg-fiddo-blue px-3 py-1 text-sm font-medium text-white hover:bg-fiddo-turquoise"
              >
                Enviar mensaje a todos
              </button>
            </div>
            {!userProfile?.tiendanube.connected ? (
              <p className="text-gray-600">Usuario no conectado a Tienda Nube.</p>
            ) : tnCustomersLoading ? (
              <p className="text-gray-600">Cargando...</p>
            ) : (
              tnFilteredCustomers.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre completo</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provincia</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Compras</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {tnFilteredCustomers
                          .slice((tnCustomersPage - 1) * TN_CUSTOMERS_PER_PAGE, tnCustomersPage * TN_CUSTOMERS_PER_PAGE)
                          .map((customer) => (
                            <tr key={customer.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-sm text-gray-900">{customer.id}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{customer.nickname}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">
                                {customer.firstName || customer.lastName
                                  ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
                                  : '-'}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-900">{customer.province || '-'}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{customer.purchaseCount}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">
                                <button
                                  className="rounded bg-fiddo-blue px-3 py-1 text-white text-xs"
                                  onClick={() => notify("La mensajería directa aún no está disponible para Tienda Nube.")}
                                >
                                  Enviar mensaje
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-center items-center gap-2 mt-6">
                    <button
                      className="px-3 py-1 rounded bg-neutral-200 text-gray-700 disabled:opacity-50"
                      onClick={() => setTnCustomersPage((p) => Math.max(1, p - 1))}
                      disabled={tnCustomersPage === 1}
                    >Anterior</button>
                    {Array.from({ length: Math.ceil(tnFilteredCustomers.length / TN_CUSTOMERS_PER_PAGE) }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        className={`px-3 py-1 rounded ${n === tnCustomersPage ? 'bg-fiddo-orange text-white' : 'bg-neutral-100 text-gray-700'}`}
                        onClick={() => setTnCustomersPage(n)}
                        disabled={n === tnCustomersPage}
                      >{n}</button>
                    ))}
                    <button
                      className="px-3 py-1 rounded bg-neutral-200 text-gray-700 disabled:opacity-50"
                      onClick={() => setTnCustomersPage((p) => p + 1)}
                      disabled={tnCustomersPage === Math.ceil(tnFilteredCustomers.length / TN_CUSTOMERS_PER_PAGE) || tnFilteredCustomers.length === 0}
                    >Siguiente</button>
                  </div>
                </>
              ) : (
                <p className="text-gray-600">No hay compradores.</p>
              )
            )}
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 mt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Productos (Tienda Nube)</h2>
            {!userProfile?.tiendanube.connected ? (
              <p className="text-gray-600">Usuario no conectado a Tienda Nube.</p>
            ) : tnProductsLoading ? (
              <p className="text-gray-600">Cargando...</p>
            ) : (
              tnProducts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {tnProducts.map((product) => (
                    <div
                      key={product.id}
                      className="border rounded-lg overflow-hidden shadow hover:shadow-lg transition bg-white"
                    >
                      <div className="w-full h-40 flex items-center justify-center bg-white">
                        <Image
                          src={product.thumbnail}
                          alt={product.title}
                          width={300}
                          height={160}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <div className="p-4 flex flex-col gap-2 bg-neutral-100">
                        <div className="font-semibold text-gray-900">{product.title}</div>
                        <div className="text-fiddo-blue font-bold text-lg">${product.price}</div>
                        <div className="text-xs text-gray-500">Stock: {product.available_quantity}</div>
                        <button
                          onClick={() => notify("Las promociones aún no están disponibles para Tienda Nube.")}
                          className="rounded bg-fiddo-orange px-3 py-1 text-white mt-2"
                        >
                          Aplicar promoción
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">Aún no hay productos.</p>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
