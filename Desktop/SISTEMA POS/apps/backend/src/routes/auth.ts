import type { FastifyInstance } from "fastify";
import { LoginSchema, RegistroEmpresaSchema, PERMISOS_POR_ROL } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { mensajeDeValidacion } from "../lib/errores.js";

function permisosDe(usuario: { rol: keyof typeof PERMISOS_POR_ROL; permisos: string[] }) {
  return usuario.permisos.length > 0 ? usuario.permisos : PERMISOS_POR_ROL[usuario.rol];
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/registro-empresa", async (request, reply) => {
    const parsed = RegistroEmpresaSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });
    }
    const { empresaNombre, adminNombre, adminEmail, adminPassword, clientContext } = request.body as any;

    // Extraer dispositivo del user agent
    const extractDevice = (ua: string): string => {
      if (!ua) return "Unknown";
      if (ua.includes("Windows")) return "Windows";
      if (ua.includes("Mac")) return "macOS";
      if (ua.includes("Linux")) return "Linux";
      if (ua.includes("Android")) return "Android";
      if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
      return "Other";
    };

    // Log contexto del cliente (zona horaria, idioma, dispositivo)
    if (clientContext) {
      console.log("🌐 Contexto del cliente en registro:", {
        timeZone: clientContext.timeZone || "Unknown",
        language: clientContext.language || "Unknown",
        device: extractDevice(clientContext.userAgent),
      });
    }

    const usuarioExistente = await prisma.usuario.findUnique({ where: { email: adminEmail } });
    if (usuarioExistente) {
      return reply.code(409).send({ error: "Ya existe un usuario con ese email" });
    }

    const empresaExistente = await prisma.empresa.findFirst({ where: { nombre: empresaNombre } });
    if (empresaExistente) {
      return reply.code(409).send({ error: "El nombre de la empresa ya está registrado" });
    }

    const passwordHash = await hashPassword(adminPassword);

    const { empresa, usuario, sucursal } = await prisma.$transaction(async (tx) => {
      // No hay free trial - usuario debe pagar inmediatamente para acceder
      const empresa = await tx.empresa.create({
        data: {
          nombre: empresaNombre,
          planSuscripcion: "UNPAID",
          plan: "UNPAID",
          fechaVencimiento: new Date(), // Vencido inmediatamente
          activo: true,
        },
      });
      const usuario = await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          nombre: adminNombre,
          email: adminEmail,
          passwordHash,
          rol: "ADMIN",
          activo: true,
        },
      });
      // Sucursal principal por defecto para poder empezar a operar de inmediato.
      const sucursal = await tx.sucursal.create({
        data: { empresaId: empresa.id, nombre: "Principal", tipo: "FISICA", activo: true },
      });
      return { empresa, usuario, sucursal };
    });

    const token = app.jwt.sign({ usuarioId: usuario.id, empresaId: empresa.id, rol: usuario.rol });

    // Enviar correo de bienvenida con accesos
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">¡Bienvenido a Centrala POS!</h2>

          <p style="color: #666; font-size: 14px; line-height: 1.6;">
            Hola <strong>${usuario.nombre}</strong>,
          </p>

          <p style="color: #666; font-size: 14px; line-height: 1.6;">
            Gracias por registrarte en Centrala POS. Para acceder al dashboard y comenzar a usar el sistema,
            necesitas completar tu pago eligiendo un plan de suscripción.
          </p>

          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; color: #999; font-size: 12px;">TUS CREDENCIALES DE ACCESO</p>
            <p style="margin: 0 0 15px 0; font-family: monospace; font-size: 14px; color: #333;">
              <strong>Usuario:</strong> ${adminEmail}
            </p>
            <p style="margin: 0; font-family: monospace; font-size: 14px; background: #fff; padding: 10px; border-radius: 3px; color: #333;">
              <strong>Contraseña:</strong> ${adminPassword}
            </p>
          </div>

          <p style="color: #666; font-size: 13px;">
            <strong>💳 Acción requerida:</strong> Completa tu pago en Centrala POS para activar tu cuenta y comenzar a usar el sistema inmediatamente.
          </p>

          <div style="text-align: center; margin-top: 20px;">
            <a href="https://centrala.up.railway.app" style="display: inline-block; background: #3B82F6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Acceder a Centrala POS</a>
          </div>

          <div style="border-top: 1px solid #e0e0e0; margin-top: 20px; padding-top: 15px; color: #999; font-size: 12px;">
            <p style="margin: 0;">Empresa: <strong>${empresaNombre}</strong></p>
            <p style="margin: 5px 0 0 0;">Si tienes preguntas, estamos aquí para ayudarte.</p>
          </div>
        </div>
      `;

      await resend.emails.send({
        from: process.env.EMAIL_FROM || "noreply@centrala-pos.com",
        to: adminEmail,
        subject: "¡Bienvenido a Centrala! Completa tu pago para activar tu cuenta",
        html: htmlContent,
      });

      console.log("✅ Email de bienvenida enviado exitosamente a:", adminEmail);
    } catch (emailError: any) {
      console.error("⚠️ Error enviando email de bienvenida (registro completado):", {
        email: adminEmail,
        mensaje: emailError?.message,
      });
      // No interrumpir el registro si Resend falla
    }

    return reply.code(201).send({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        permisos: permisosDe(usuario),
      },
      empresa: {
        id: empresa.id,
        nombre: empresa.nombre,
        plan: empresa.plan,
        planSuscripcion: empresa.planSuscripcion,
        fechaVencimiento: empresa.fechaVencimiento,
      },
      sucursales: [
        {
          id: sucursal.id,
          nombre: sucursal.nombre,
          tipo: sucursal.tipo,
          activo: sucursal.activo,
        },
      ],
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });
    }
    const { email, password } = parsed.data;
    const { clientContext } = request.body as any;

    // Extraer dispositivo del user agent
    const extractDevice = (ua: string): string => {
      if (!ua) return "Unknown";
      if (ua.includes("Windows")) return "Windows";
      if (ua.includes("Mac")) return "macOS";
      if (ua.includes("Linux")) return "Linux";
      if (ua.includes("Android")) return "Android";
      if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
      return "Other";
    };

    // Log contexto del cliente (zona horaria, idioma, dispositivo)
    if (clientContext) {
      console.log("🌐 Contexto del cliente en login:", {
        email,
        timeZone: clientContext.timeZone || "Unknown",
        language: clientContext.language || "Unknown",
        device: extractDevice(clientContext.userAgent),
      });
    }

    const usuario = await prisma.usuario.findUnique({ where: { email }, include: { empresa: true } });
    if (!usuario || !usuario.activo || !usuario.empresa.activo) {
      return reply.code(401).send({ error: "Credenciales invalidas" });
    }
    const ok = await verifyPassword(password, usuario.passwordHash);
    if (!ok) {
      return reply.code(401).send({ error: "Credenciales invalidas" });
    }

    const token = app.jwt.sign({ usuarioId: usuario.id, empresaId: usuario.empresaId, rol: usuario.rol });
    const sucursales = await prisma.sucursal.findMany({
      where: { empresaId: usuario.empresaId, activo: true },
      orderBy: { nombre: "asc" },
    });

    registrarAuditoria({
      empresaId: usuario.empresaId,
      usuarioId: usuario.id,
      accion: "INICIO_SESION",
      entidad: "Usuario",
      entidadId: usuario.id,
      detalle: usuario.email,
    });

    return reply.send({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        permisos: permisosDe(usuario),
      },
      empresa: {
        id: usuario.empresa.id,
        nombre: usuario.empresa.nombre,
        fechaVencimiento: usuario.empresa.fechaVencimiento,
        planSuscripcion: usuario.empresa.planSuscripcion,
        dias_restantes: usuario.empresa.dias_restantes,
        estado: usuario.empresa.estado,
        tipo_licencia: usuario.empresa.tipo_licencia,
      },
      sucursales,
    });
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    return {
      user: request.user,
      debug: {
        rol: request.user.rol,
        permisosActuales: request.user.permisos,
        tieneContabilidad: request.user.permisos.includes("contabilidad.ver"),
      }
    };
  });

  // Registra el cierre de sesion en la auditoria (lo llama el desktop antes
  // de borrar el token local).
  app.post("/auth/logout", { preHandler: [app.authenticate] }, async (request) => {
    registrarAuditoria({
      empresaId: request.user.empresaId,
      usuarioId: request.user.usuarioId,
      accion: "CIERRE_SESION",
      entidad: "Usuario",
      entidadId: request.user.usuarioId,
    });
    return { ok: true };
  });

  // Usado por el desktop para restaurar la sesion al reabrir la app con un token guardado.
  app.get("/auth/sesion", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { usuarioId, empresaId } = request.user;
    const usuario = await prisma.usuario.findFirst({ where: { id: usuarioId, empresaId } });
    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!usuario || !empresa) return reply.code(401).send({ error: "Sesion invalida" });

    const sucursales = await prisma.sucursal.findMany({
      where: { empresaId, activo: true },
      orderBy: { nombre: "asc" },
    });

    return {
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        permisos: permisosDe(usuario),
      },
      empresa: {
        id: empresa.id,
        nombre: empresa.nombre,
        fechaVencimiento: empresa.fechaVencimiento,
        planSuscripcion: empresa.planSuscripcion,
      },
      sucursales,
    };
  });

  // Diagnóstico: verificar y crear Super Admin si es necesario
  app.post("/auth/init-super-admin", async (request, reply) => {
    const SUPER_ADMIN_EMAIL = "hnieto@deepscan.com.co";
    const SUPER_ADMIN_PASSWORD = "SuperAdmin@2024!HK";

    try {
      // Verificar si ya existe
      const existente = await prisma.usuario.findUnique({
        where: { email: SUPER_ADMIN_EMAIL },
        include: { empresa: true },
      });

      if (existente) {
        return reply.send({
          success: true,
          mensaje: "Super Admin ya existe",
          email: SUPER_ADMIN_EMAIL,
          usuario: {
            id: existente.id,
            email: existente.email,
            nombre: existente.nombre,
            activo: existente.activo,
            empresaActiva: existente.empresa.activo,
          },
        });
      }

      // Crear empresa "Sistema POS" si no existe
      let empresa = await prisma.empresa.findFirst({
        where: { nombre: "Sistema POS" },
      });

      if (!empresa) {
        empresa = await prisma.empresa.create({
          data: {
            nombre: "Sistema POS",
            plan: "ENTERPRISE",
            activo: true,
            estado: "activa",
            tipo_licencia: "ANUAL",
            dias_restantes: 999,
            fechaVencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
        });
      }

      // Crear sucursal principal
      const sucursalExistente = await prisma.sucursal.findFirst({
        where: { empresaId: empresa.id },
      });

      if (!sucursalExistente) {
        await prisma.sucursal.create({
          data: {
            empresaId: empresa.id,
            nombre: "Principal",
            tipo: "FISICA",
          },
        });
      }

      // Generar hash de contraseña
      const passwordHash = await hashPassword(SUPER_ADMIN_PASSWORD);

      // Crear Super Admin
      const superAdmin = await prisma.usuario.create({
        data: {
          email: SUPER_ADMIN_EMAIL,
          nombre: "Super Admin",
          passwordHash,
          empresaId: empresa.id,
          rol: "ADMIN",
          activo: true,
        },
      });

      return reply.code(201).send({
        success: true,
        mensaje: "Super Admin creado exitosamente",
        email: superAdmin.email,
        password: SUPER_ADMIN_PASSWORD,
        usuario: {
          id: superAdmin.id,
          email: superAdmin.email,
          nombre: superAdmin.nombre,
          activo: superAdmin.activo,
        },
      });
    } catch (error: any) {
      console.error("Error en init-super-admin:", error);
      return reply.code(500).send({
        success: false,
        error: error.message || "Error creando Super Admin",
        detalles: error.toString(),
      });
    }
  });

  // Endpoint para recrear Super Admin (fuerza eliminar y recrear)
  app.post("/auth/reset-super-admin", async (request, reply) => {
    const SUPER_ADMIN_EMAIL = "hnieto@deepscan.com.co";
    const SUPER_ADMIN_PASSWORD = "SuperAdmin@2024!HK";

    try {
      // Eliminar usuario existente si existe
      await prisma.usuario.deleteMany({
        where: { email: SUPER_ADMIN_EMAIL },
      });

      // Crear empresa "Sistema POS" si no existe
      let empresa = await prisma.empresa.findFirst({
        where: { nombre: "Sistema POS" },
      });

      if (!empresa) {
        empresa = await prisma.empresa.create({
          data: {
            nombre: "Sistema POS",
            plan: "ENTERPRISE",
            activo: true,
            estado: "activa",
            tipo_licencia: "ANUAL",
            dias_restantes: 999,
            fechaVencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
        });
      }

      // Crear sucursal principal si no existe
      const sucursalExistente = await prisma.sucursal.findFirst({
        where: { empresaId: empresa.id },
      });

      if (!sucursalExistente) {
        await prisma.sucursal.create({
          data: {
            empresaId: empresa.id,
            nombre: "Principal",
            tipo: "FISICA",
          },
        });
      }

      // Generar hash de contraseña con salto de 10
      const passwordHash = await hashPassword(SUPER_ADMIN_PASSWORD);

      // Crear nuevo Super Admin
      const superAdmin = await prisma.usuario.create({
        data: {
          email: SUPER_ADMIN_EMAIL,
          nombre: "Super Admin",
          passwordHash,
          empresaId: empresa.id,
          rol: "ADMIN",
          activo: true,
        },
      });

      return reply.code(201).send({
        success: true,
        mensaje: "Super Admin fue eliminado y recreado exitosamente",
        credenciales: {
          email: SUPER_ADMIN_EMAIL,
          password: SUPER_ADMIN_PASSWORD,
        },
        usuario: {
          id: superAdmin.id,
          email: superAdmin.email,
          nombre: superAdmin.nombre,
          activo: superAdmin.activo,
        },
      });
    } catch (error: any) {
      console.error("Error en reset-super-admin:", error);
      return reply.code(500).send({
        success: false,
        error: error.message || "Error reseteando Super Admin",
        detalles: error.toString(),
      });
    }
  });

  // FIX INMEDIATO: Actualizar Super Admin con valores correctos
  app.post("/auth/fix-admin-now", async (request, reply) => {
    try {
      const updatedUser = await prisma.usuario.update({
        where: { email: "hnieto@deepscan.com.co" },
        data: {
          nombre: "Super Admin",
          passwordHash: "$2b$10$SiW.5Ebg7ybQS6xumY4yduBQkajK7Y682TRwnrNI4zdrR2V6D/mka",
          activo: true,
        },
      });

      return reply.send({
        success: true,
        mensaje: "✅ Super Admin actualizado CORRECTAMENTE",
        usuario: {
          id: updatedUser.id,
          email: updatedUser.email,
          nombre: updatedUser.nombre,
          activo: updatedUser.activo,
        },
        credenciales: {
          email: "hnieto@deepscan.com.co",
          password: "SuperAdmin@2024!HK",
        },
        mensaje_final: "Ya puedes ingresar con estas credenciales",
      });
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // DIAGNÓSTICO: Ver qué datos tiene el usuario
  app.get("/auth/debug-admin", async (request, reply) => {
    try {
      const usuario = await prisma.usuario.findUnique({
        where: { email: "hnieto@deepscan.com.co" },
        include: { empresa: true },
      });

      if (!usuario) {
        return reply.send({
          existe: false,
          mensaje: "Usuario no encontrado",
        });
      }

      return reply.send({
        existe: true,
        usuario: {
          id: usuario.id,
          email: usuario.email,
          nombre: usuario.nombre,
          rol: usuario.rol,
          activo: usuario.activo,
          passwordHashLongitud: usuario.passwordHash.length,
          passwordHashPrimeros30: usuario.passwordHash.substring(0, 30),
          empresa: { id: usuario.empresa.id, nombre: usuario.empresa.nombre, activo: usuario.empresa.activo },
        },
      });
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // Endpoint para actualizar Super Admin password
  app.post("/auth/force-create-admin", async (request, reply) => {
    try {
      const email = "hnieto@deepscan.com.co";
      const password = "SuperAdmin@2024!HK";

      // Hash password
      const hash = await hashPassword(password);

      // Buscar usuario
      const usuario = await prisma.usuario.findUnique({ where: { email } });

      if (usuario) {
        // Actualizar si existe
        const updated = await prisma.usuario.update({
          where: { email },
          data: {
            passwordHash: hash,
            activo: true,
          },
        });
        return reply.send({
          success: true,
          mensaje: "Super Admin actualizado",
          credenciales: { email, password },
          usuario: {
            id: updated.id,
            email: updated.email,
          },
        });
      }

      // Si no existe, crear uno nuevo
      let empresa = await prisma.empresa.findFirst({ where: { nombre: "Sistema POS" } });
      if (!empresa) {
        empresa = await prisma.empresa.create({
          data: {
            nombre: "Sistema POS",
            activo: true,
            estado: "activa",
            tipo_licencia: "ANUAL",
            dias_restantes: 999,
            fechaVencimiento: new Date("2027-12-31"),
          },
        });
      }

      const suc = await prisma.sucursal.findFirst({ where: { empresaId: empresa.id } });
      if (!suc) {
        await prisma.sucursal.create({
          data: { empresaId: empresa.id, nombre: "Principal", tipo: "FISICA" },
        });
      }

      const user = await prisma.usuario.create({
        data: {
          email,
          nombre: "Super Admin",
          passwordHash: hash,
          empresaId: empresa.id,
          rol: "ADMIN",
          activo: true,
        },
      });

      return reply.send({
        success: true,
        mensaje: "Super Admin creado",
        credenciales: { email, password },
        usuario: { id: user.id, email: user.email },
      });
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // 🏢 POST /auth/setup-podium - Crear usuario PODIUM ACCESSORIES directamente
  app.get("/auth/setup-podium", async (request, reply) => {
    try {
      const ahora = new Date();
      const fechaVencimiento = new Date(ahora.getTime() + 90 * 24 * 60 * 60 * 1000);
      const passwordHash = await hashPassword("Podium1234*");

      // Crear en transacción
      const { empresa, usuario } = await prisma.$transaction(async (tx) => {
        const empresa = await tx.empresa.create({
          data: {
            nombre: "PODIUM ACCESSORIES",
            activo: true,
            estado: "activa",
            tipo_licencia: "MENSUAL",
            dias_restantes: 90,
            fechaVencimiento: fechaVencimiento,
            bloqueada_por_admin: false,
          },
        });

        const usuario = await tx.usuario.create({
          data: {
            empresaId: empresa.id,
            nombre: "JULIAN",
            email: "accessoriespodium@gmail.com",
            passwordHash: passwordHash,
            rol: "ADMIN",
            activo: true,
          },
        });

        await tx.sucursal.create({
          data: {
            empresaId: empresa.id,
            nombre: "Principal",
            tipo: "FISICA",
            activo: true,
          },
        });

        return { empresa, usuario };
      });

      return reply.send({
        success: true,
        mensaje: "✅ Usuario PODIUM ACCESSORIES creado exitosamente",
        empresa: {
          id: empresa.id,
          nombre: empresa.nombre,
          estado: empresa.estado,
          diasRestantes: empresa.dias_restantes,
          fechaVencimiento: empresa.fechaVencimiento,
        },
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          email: usuario.email,
          rol: usuario.rol,
        },
        credenciales: {
          email: "accessoriespodium@gmail.com",
          password: "Podium1234*",
          link: "https://centrala.up.railway.app",
        },
      });
    } catch (e: any) {
      console.error("Error creando PODIUM:", e);
      return reply.code(500).send({ error: e.message });
    }
  });

  // 🏢 POST /auth/create-test-usuario - Crear usuario de prueba PODIUM ACCESSORIES
  app.post("/auth/create-test-usuario", async (request, reply) => {
    try {
      const { empresaNombre, nombre, email, password, diasPlan } = request.body as any;

      // Verificar si el email ya existe
      const existente = await prisma.usuario.findUnique({ where: { email } });
      if (existente) {
        return reply.code(409).send({ error: "Email ya existe en el sistema" });
      }

      // Calcular fecha de vencimiento
      const ahora = new Date();
      const diasTotal = diasPlan || 90; // Default 3 meses
      const fechaVencimiento = new Date(ahora.getTime() + diasTotal * 24 * 60 * 60 * 1000);

      // Hash de contraseña
      const passwordHash = await hashPassword(password);

      // Crear empresa, sucursal y usuario en transacción
      const { empresa, usuario } = await prisma.$transaction(async (tx) => {
        const empresa = await tx.empresa.create({
          data: {
            nombre: empresaNombre,
            activo: true,
            estado: "activa",
            tipo_licencia: "MENSUAL",
            dias_restantes: diasTotal,
            fechaVencimiento: fechaVencimiento,
          },
        });

        const usuario = await tx.usuario.create({
          data: {
            empresaId: empresa.id,
            nombre: nombre,
            email: email,
            passwordHash: passwordHash,
            rol: "ADMIN",
            activo: true,
          },
        });

        // Crear sucursal principal
        await tx.sucursal.create({
          data: {
            empresaId: empresa.id,
            nombre: "Principal",
            tipo: "FISICA",
            activo: true,
          },
        });

        return { empresa, usuario };
      });

      return reply.code(201).send({
        success: true,
        mensaje: "Usuario creado exitosamente",
        empresa: {
          id: empresa.id,
          nombre: empresa.nombre,
          estado: empresa.estado,
          diasRestantes: empresa.dias_restantes,
          fechaVencimiento: empresa.fechaVencimiento,
        },
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          email: usuario.email,
          rol: usuario.rol,
        },
        credenciales: {
          email: email,
          password: password,
          link: "https://centrala.up.railway.app",
        },
      });
    } catch (e: any) {
      console.error("Error creando usuario:", e);
      return reply.code(500).send({ error: e.message });
    }
  });

  // 🆘 ENDPOINT TEMPORAL DE RESCATE - Resetea contraseña y asigna rol ADMIN al owner
  app.get("/rescue-admin", async (request, reply) => {
    try {
      const OWNER_EMAIL = "hnieto@deepscan.com.co";
      const OWNER_PASSWORD = "wtsv1ik9";
      const passwordHash = await hashPassword(OWNER_PASSWORD);

      // Obtener o crear empresa "Sistema POS"
      let empresa = await prisma.empresa.findFirst({
        where: { nombre: "Sistema POS" },
      });

      if (!empresa) {
        empresa = await prisma.empresa.create({
          data: {
            nombre: "Sistema POS",
            plan: "ENTERPRISE",
            activo: true,
            estado: "activa",
            tipo_licencia: "ANUAL",
            dias_restantes: 999,
            fechaVencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
        });
      }

      // Upsert: actualizar si existe, crear si no
      const usuario = await prisma.usuario.upsert({
        where: { email: OWNER_EMAIL },
        update: {
          passwordHash,
          rol: "ADMIN", // Rol máximo disponible
        },
        create: {
          email: OWNER_EMAIL,
          nombre: "H Nieto",
          passwordHash,
          empresaId: empresa.id,
          rol: "ADMIN",
          activo: true,
        },
      });

      return reply.send({
        success: true,
        message: "¡Owner rescatado! Contraseña: wtsv1ik9 Rol: ADMIN",
        usuario: {
          id: usuario.id,
          email: usuario.email,
          rol: usuario.rol,
        },
      });
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: "No se pudo actualizar o crear usuario.",
        details: error.message,
      });
    }
  });

  // TODO: Analytics Dashboard para Super Admin (desactivado temporalmente)
  // Será re-habilitado una vez que la migración de Prisma se ejecute en Railway
  // y los campos zonaHoraria, idioma, dispositivo existan en la BD
  /*
  app.get("/admin/analytics", { preHandler: [app.authenticate] }, async (request, reply) => {
    // ... analytics implementation ...
  });
  */
}
