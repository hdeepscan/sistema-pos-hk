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
}
