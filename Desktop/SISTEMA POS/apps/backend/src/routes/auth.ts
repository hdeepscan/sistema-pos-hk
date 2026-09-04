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
    const { empresaNombre, adminNombre, adminEmail, adminPassword } = parsed.data;

    const existente = await prisma.usuario.findUnique({ where: { email: adminEmail } });
    if (existente) {
      return reply.code(409).send({ error: "Ya existe un usuario con ese email" });
    }

    const passwordHash = await hashPassword(adminPassword);

    const { empresa, usuario } = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nombre: empresaNombre } });
      const usuario = await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          nombre: adminNombre,
          email: adminEmail,
          passwordHash,
          rol: "ADMIN",
        },
      });
      // Sucursal principal por defecto para poder empezar a operar de inmediato.
      await tx.sucursal.create({
        data: { empresaId: empresa.id, nombre: "Principal", tipo: "FISICA" },
      });
      return { empresa, usuario };
    });

    const token = app.jwt.sign({ usuarioId: usuario.id, empresaId: empresa.id, rol: usuario.rol });
    return reply.code(201).send({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        permisos: permisosDe(usuario),
      },
      empresa: { id: empresa.id, nombre: empresa.nombre },
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: mensajeDeValidacion(parsed.error) });
    }
    const { email, password } = parsed.data;

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
        es_super_admin: usuario.es_super_admin,
        permisos: permisosDe(usuario),
      },
      empresa: {
        id: usuario.empresa.id,
        nombre: usuario.empresa.nombre,
        fechaVencimiento: usuario.empresa.fechaVencimiento,
        planSuscripcion: usuario.empresa.planSuscripcion,
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
            es_super_admin: existente.es_super_admin,
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
          es_super_admin: true,
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
          es_super_admin: superAdmin.es_super_admin,
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
          es_super_admin: true,
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
          es_super_admin: superAdmin.es_super_admin,
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
          es_super_admin: true,
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
          es_super_admin: updatedUser.es_super_admin,
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
          es_super_admin: usuario.es_super_admin,
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
            es_super_admin: true,
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
            es_super_admin: updated.es_super_admin,
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
          es_super_admin: true,
          activo: true,
        },
      });

      return reply.send({
        success: true,
        mensaje: "Super Admin creado",
        credenciales: { email, password },
        usuario: { id: user.id, email: user.email, es_super_admin: user.es_super_admin },
      });
    } catch (e: any) {
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
}
