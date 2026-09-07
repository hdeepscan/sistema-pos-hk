import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

// 🔐 Middleware: Verificar Super Admin
const verificarSuperAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // El JWT fue verificado por app.authenticate, así que request.user debe existir
    const usuarioId = request.user?.usuarioId;

    if (!usuarioId) {
      console.error("🔴 ADMIN MIDDLEWARE: usuarioId no encontrado en request.user", {
        user: request.user,
      });
      return reply.code(401).send({ error: "No autorizado - Usuario no identificado" });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, email: true, es_super_admin: true },
    });

    console.log("🔍 ADMIN CHECK:", {
      usuarioId,
      email: usuario?.email,
      es_super_admin: usuario?.es_super_admin,
    });

    if (!usuario) {
      console.error(`🔴 ADMIN MIDDLEWARE: Usuario no encontrado en BD - ID: ${usuarioId}`);
      return reply.code(401).send({ error: "No autorizado - Usuario no encontrado" });
    }

    if (!usuario.es_super_admin) {
      console.warn(
        `⚠️ SEGURIDAD: Intento de acceso no autorizado a admin por ${usuario.email}`
      );
      return reply.code(403).send({ error: "Solo Super Admin puede acceder" });
    }

    console.log(`✅ ADMIN ACCESS GRANTED para ${usuario.email}`);
    (request as any).superAdmin = usuario;
  } catch (error: any) {
    console.error("🔴 ADMIN MIDDLEWARE ERROR:", {
      error: error.message,
      stack: error.stack,
    });
    reply.code(500).send({ error: "Error verificando permisos" });
  }
};

export default async function adminRoutes(app: FastifyInstance) {
  // 📊 GET /admin/clientes - Listar todos los clientes
  app.get(
    "/clientes",
    { preHandler: [app.authenticate, verificarSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const clientes = await prisma.empresa.findMany({
        select: {
          id: true,
          nombre: true,
          estado: true,
          tipo_licencia: true,
          dias_restantes: true,
          fechaVencimiento: true,
          bloqueada_por_admin: true,
          razon_bloqueo: true,
          fechaRegistro: true,
          usuarios: {
            select: {
              email: true,
              nombre: true,
            },
            where: { rol: "ADMIN" },
            take: 1,
          },
        },
        orderBy: { fechaRegistro: "desc" },
      });

      const clientesFormateados = clientes.map((c: any) => ({
        id: c.id,
        nombre: c.nombre,
        estado: c.estado,
        tipo_licencia: c.tipo_licencia,
        dias_restantes: c.dias_restantes,
        email_admin: c.usuarios?.[0]?.email || "N/A",
        nombre_admin: c.usuarios?.[0]?.nombre || "N/A",
        fecha_creacion: c.fechaRegistro,
        fecha_vencimiento: c.fechaVencimiento,
        bloqueada_por_admin: c.bloqueada_por_admin,
        razon_bloqueo: c.razon_bloqueo,
      }));

      reply.send(clientesFormateados);
    } catch (error) {
      console.error("Error listando clientes:", error);
      reply.code(500).send({ error: "Error listando clientes" });
    }
  });

  // ➕ POST /admin/clientes - Crear nuevo cliente (bypass de pago)
  app.post(
    "/clientes",
    { preHandler: [app.authenticate, verificarSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { nombreEmpresa, emailAdmin, nombreAdmin, tipoLicencia } = request.body as any;

      console.log("➕ CREATE CLIENT REQUEST:", {
        nombreEmpresa,
        emailAdmin,
        nombreAdmin,
        tipoLicencia,
        superAdminId: (request as any).superAdmin?.id,
      });

      if (!nombreEmpresa || !emailAdmin || !nombreAdmin) {
        console.error("❌ MISSING REQUIRED FIELDS:", {
          nombreEmpresa: !!nombreEmpresa,
          emailAdmin: !!emailAdmin,
          nombreAdmin: !!nombreAdmin,
        });
        return reply.code(400).send({ error: "Faltan datos requeridos" });
      }

      // Generar contraseña temporal
      const passwordTemporal = `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const passwordHash = await bcrypt.hash(passwordTemporal, 10);

      // Calcular fecha de vencimiento según tipo de licencia
      const hoy = new Date();
      let diasExpiracion = 30;
      if (tipoLicencia === "prueba") diasExpiracion = 14;
      else if (tipoLicencia === "trimestral") diasExpiracion = 90;
      else if (tipoLicencia === "anual") diasExpiracion = 365;

      const fechaVencimiento = new Date(hoy.getTime() + diasExpiracion * 24 * 60 * 60 * 1000);

      // Crear empresa
      const empresa = await prisma.empresa.create({
        data: {
          nombre: nombreEmpresa,
          estado: "activa",
          tipo_licencia: tipoLicencia,
          dias_restantes: diasExpiracion,
          fechaVencimiento: fechaVencimiento,
          bloqueada_por_admin: false,
        },
      });

      // Crear usuario admin para la empresa
      const usuario = await prisma.usuario.create({
        data: {
          email: emailAdmin,
          nombre: nombreAdmin,
          passwordHash: passwordHash,
          empresaId: empresa.id,
          rol: "ADMIN",
          es_super_admin: false,
        },
      });

      // Registrar en auditoría
      await prisma.adminAuditoria.create({
        data: {
          super_admin_id: (request as any).superAdmin.id,
          accion: "CREAR_CLIENTE",
          entidad: "empresas",
          entidad_id: empresa.id,
          detalles: JSON.stringify({
            nombre: nombreEmpresa,
            email_admin: emailAdmin,
            tipo_licencia: tipoLicencia,
          }),
        },
      });

      console.log("✅ CLIENT CREATED SUCCESSFULLY:", {
        empresaId: empresa.id,
        empresaNombre: empresa.nombre,
        usuarioId: usuario.id,
        usuarioEmail: usuario.email,
        tipoLicencia: empresa.tipo_licencia,
      });

      reply.send({
        success: true,
        empresa,
        usuario,
        passwordTemporal,
        mensaje: "Cliente creado exitosamente. Contraseña temporal generada.",
      });
    } catch (error: any) {
      console.error("❌ CREATE CLIENT ERROR:", {
        error: error.message,
        stack: error.stack,
        payload: {
          nombreEmpresa: (request.body as any)?.nombreEmpresa,
          emailAdmin: (request.body as any)?.emailAdmin,
          tipoLicencia: (request.body as any)?.tipoLicencia,
        },
      });
      reply.code(500).send({ error: "Error creando cliente" });
    }
  });

  // 📅 PATCH /admin/clientes/:id/licencia - Extender licencia
  app.patch(
    "/clientes/:id/licencia",
    { preHandler: [app.authenticate, verificarSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as any;
      const { dias } = request.body as any;

      console.log("⏱️ EXTEND LICENSE REQUEST:", {
        clienteId: id,
        dias,
        superAdminId: (request as any).superAdmin?.id,
      });

      if (!dias || dias <= 0) {
        console.error("❌ INVALID DIAS:", { dias, type: typeof dias });
        return reply.code(400).send({ error: "Días inválido" });
      }

      const empresa = await prisma.empresa.findUnique({ where: { id } });
      if (!empresa) {
        console.error("❌ CLIENT NOT FOUND:", { clienteId: id });
        return reply.code(404).send({ error: "Cliente no encontrado" });
      }

      const nuevaFecha = new Date(
        empresa.fechaVencimiento!.getTime() + dias * 24 * 60 * 60 * 1000
      );
      const nuevosDias = empresa.dias_restantes + dias;

      const empresaActualizada = await prisma.empresa.update({
        where: { id },
        data: {
          fechaVencimiento: nuevaFecha,
          dias_restantes: nuevosDias,
        },
      });

      console.log("✅ LICENSE EXTENDED:", {
        clienteId: id,
        diasAgregados: dias,
        nuevosDiasRestantes: nuevosDias,
        nuevaFecha,
      });

      // Auditoría
      await prisma.adminAuditoria.create({
        data: {
          super_admin_id: (request as any).superAdmin.id,
          accion: "EXTENDER_LICENCIA",
          entidad: "empresas",
          entidad_id: id,
          detalles: JSON.stringify({ dias, nueva_fecha: nuevaFecha }),
        },
      });

      reply.send({ success: true, empresa: empresaActualizada });
    } catch (error: any) {
      console.error("❌ EXTEND LICENSE ERROR:", {
        error: error.message,
        stack: error.stack,
        clienteId: (request.params as any).id,
        dias: (request.body as any)?.dias,
      });
      reply.code(500).send({ error: "Error extendiendo licencia" });
    }
  });

  // 🔑 POST /admin/clientes/:id/reset-password - Resetear contraseña
  app.post(
    "/clientes/:id/reset-password",
    { preHandler: [app.authenticate, verificarSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as any;

      console.log("🔑 RESET PASSWORD REQUEST:", {
        clienteId: id,
        superAdminId: (request as any).superAdmin?.id,
      });

      const empresa = await prisma.empresa.findUnique({ where: { id } });
      if (!empresa) {
        console.error("❌ CLIENT NOT FOUND FOR PASSWORD RESET:", { clienteId: id });
        return reply.code(404).send({ error: "Cliente no encontrado" });
      }

      // Generar nueva contraseña temporal
      const nuevaPassword = `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const passwordHash = await bcrypt.hash(nuevaPassword, 10);

      // Actualizar usuario admin de la empresa
      const updateResult = await prisma.usuario.updateMany({
        where: { empresaId: id, rol: "ADMIN" },
        data: { passwordHash: passwordHash },
      });

      console.log("✅ PASSWORD RESET:", {
        clienteId: id,
        empresa: empresa.nombre,
        usuariosActualizados: updateResult.count,
      });

      // Auditoría
      await prisma.adminAuditoria.create({
        data: {
          super_admin_id: (request as any).superAdmin.id,
          accion: "RESET_PASSWORD",
          entidad: "empresas",
          entidad_id: id,
        },
      });

      reply.send({
        success: true,
        passwordTemporal: nuevaPassword,
        mensaje: "Contraseña reseteada. Nueva contraseña temporal generada.",
      });
    } catch (error: any) {
      console.error("❌ RESET PASSWORD ERROR:", {
        error: error.message,
        stack: error.stack,
        clienteId: (request.params as any).id,
      });
      reply.code(500).send({ error: "Error reseteando password" });
    }
  });

  // 🚫 PATCH /admin/clientes/:id/bloquear - Bloquear/Desbloquear cliente
  app.patch(
    "/clientes/:id/bloquear",
    { preHandler: [app.authenticate, verificarSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as any;
      const { bloqueado, razon } = request.body as any;

      console.log("🔒 BLOCK/UNBLOCK REQUEST:", {
        clienteId: id,
        bloqueado,
        razon,
        superAdminId: (request as any).superAdmin?.id,
      });

      const empresa = await prisma.empresa.update({
        where: { id },
        data: {
          bloqueada_por_admin: bloqueado,
          razon_bloqueo: razon || null,
          fecha_ultimo_bloqueo: bloqueado ? new Date() : null,
        },
      });

      console.log("✅ CLIENT BLOCK STATUS UPDATED:", {
        clienteId: id,
        bloqueado,
        empresa: empresa.nombre,
      });

      // Auditoría
      await prisma.adminAuditoria.create({
        data: {
          super_admin_id: (request as any).superAdmin.id,
          accion: bloqueado ? "BLOQUEAR_CLIENTE" : "DESBLOQUEAR_CLIENTE",
          entidad: "empresas",
          entidad_id: id,
          detalles: JSON.stringify({ razon }),
        },
      });

      reply.send({ success: true, empresa });
    } catch (error: any) {
      console.error("❌ BLOCK/UNBLOCK ERROR:", {
        error: error.message,
        stack: error.stack,
        clienteId: (request.params as any).id,
        payload: { bloqueado: (request.body as any)?.bloqueado, razon: (request.body as any)?.razon },
      });
      reply.code(500).send({ error: "Error bloqueando cliente" });
    }
  });

  // 📋 GET /admin/auditoria - Ver logs de auditoría
  app.get(
    "/auditoria",
    { preHandler: [app.authenticate, verificarSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const logs = await prisma.adminAuditoria.findMany({
        orderBy: { fecha: "desc" },
        take: 100,
      });

      reply.send(logs);
    } catch (error) {
      console.error("Error obteniendo auditoría:", error);
      reply.code(500).send({ error: "Error obteniendo auditoría" });
    }
  });

  // 📊 GET /admin/reportes/proveedores - Dashboard de Análisis de Proveedores (MOCK DATA)
  app.get(
    "/reportes/proveedores",
    { preHandler: [app.authenticate, verificarSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log("📊 ANALYTICS: Proveedores Analytics Request");

      // MOCK DATA - Datos simulados para la interfaz
      const mockData = {
        insights: [
          {
            id: "insight-1",
            icon: "💰",
            titulo: "Mayor Inversión",
            descripcion: "Nike concentra el 38% del inventario ($17.1M)",
            tipo: "info",
          },
          {
            id: "insight-2",
            icon: "🚨",
            titulo: "Stock Estancado",
            descripcion: "$4.5M sin movimiento hace 60+ días",
            tipo: "warning",
          },
          {
            id: "insight-3",
            icon: "📈",
            titulo: "Mayor Rentabilidad",
            descripcion: "Adidas lidera con 42% de margen bruto",
            tipo: "success",
          },
        ],
        kpis: {
          totalProveedores: 12,
          valorInventario: 45000000,
          valorVenta: 72000000,
          utilidadPotencial: 27000000,
        },
        graficoDistribucion: [
          { nombre: "Nike", valor: 17100000, porcentaje: 38 },
          { nombre: "Adidas", valor: 11250000, porcentaje: 25 },
          { nombre: "Puma", valor: 8100000, porcentaje: 18 },
          { nombre: "New Balance", valor: 5400000, porcentaje: 12 },
          { nombre: "Otros", valor: 3150000, porcentaje: 7 },
        ],
        ranking: [
          {
            id: "prov-1",
            nombre: "Nike",
            productos: 145,
            unidades: 8900,
            costo: 12600000,
            venta: 17100000,
            utilidad: 4500000,
            margenPorcentaje: 35.7,
          },
          {
            id: "prov-2",
            nombre: "Adidas",
            productos: 98,
            unidades: 6200,
            costo: 6506250,
            venta: 11250000,
            utilidad: 4743750,
            margenPorcentaje: 42.2,
          },
          {
            id: "prov-3",
            nombre: "Puma",
            productos: 76,
            unidades: 4500,
            costo: 5670000,
            venta: 8100000,
            utilidad: 2430000,
            margenPorcentaje: 30.0,
          },
          {
            id: "prov-4",
            nombre: "New Balance",
            productos: 52,
            unidades: 3100,
            costo: 3780000,
            venta: 5400000,
            utilidad: 1620000,
            margenPorcentaje: 30.0,
          },
          {
            id: "prov-5",
            nombre: "Reebok",
            productos: 41,
            unidades: 2200,
            costo: 1890000,
            venta: 3150000,
            utilidad: 1260000,
            margenPorcentaje: 40.0,
          },
          {
            id: "prov-6",
            nombre: "ASICS",
            productos: 34,
            unidades: 1800,
            costo: 2160000,
            venta: 3240000,
            utilidad: 1080000,
            margenPorcentaje: 33.3,
          },
          {
            id: "prov-7",
            nombre: "Saucony",
            productos: 28,
            unidades: 1400,
            costo: 1470000,
            venta: 2100000,
            utilidad: 630000,
            margenPorcentaje: 30.0,
          },
          {
            id: "prov-8",
            nombre: "Mizuno",
            productos: 22,
            unidades: 950,
            costo: 1235000,
            venta: 1710000,
            utilidad: 475000,
            margenPorcentaje: 27.8,
          },
          {
            id: "prov-9",
            nombre: "Brooks",
            productos: 18,
            unidades: 800,
            costo: 960000,
            venta: 1440000,
            utilidad: 480000,
            margenPorcentaje: 33.3,
          },
          {
            id: "prov-10",
            nombre: "Hoka",
            productos: 15,
            unidades: 650,
            costo: 1170000,
            venta: 1950000,
            utilidad: 780000,
            margenPorcentaje: 40.0,
          },
        ],
      };

      console.log("✅ ANALYTICS: Datos mockeados listos");
      reply.send(mockData);
    } catch (error: any) {
      console.error("❌ ANALYTICS ERROR:", {
        error: error.message,
        stack: error.stack,
      });
      reply.code(500).send({ error: "Error obteniendo reportes" });
    }
  });
}
