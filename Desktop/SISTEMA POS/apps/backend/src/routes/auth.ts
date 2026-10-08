import type { FastifyInstance } from "fastify";
import { randomBytes } from "crypto";
import { LoginSchema, RegistroEmpresaSchema, PERMISOS_POR_ROL } from "@sistema-pos/shared";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { mensajeDeValidacion } from "../lib/errores.js";

function permisosDe(usuario: { rol: keyof typeof PERMISOS_POR_ROL; permisos: string[] }) {
  return usuario.permisos.length > 0 ? usuario.permisos : PERMISOS_POR_ROL[usuario.rol];
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    try {
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
    } catch (error: any) {
      const body = request.body as any;
      console.error("💥 ERROR CRÍTICO EN LOGIN:", {
        email: body?.email || "unknown",
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        errorDetails: error,
      });
      return reply.code(500).send({
        error: "Error procesando login",
        details: error.message,
      });
    }
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

  // 🔐 POST /auth/forgot-password - Solicitar reset de contraseña
  app.post("/auth/forgot-password", async (request, reply) => {
    try {
      const { email } = request.body as { email: string };

      const usuario = await prisma.usuario.findUnique({ where: { email } });

      // Por seguridad, no revelamos si el usuario existe o no
      if (!usuario) {
        return reply.send({
          success: true,
          message: "Si el email existe, recibirás un enlace para resetear tu contraseña",
        });
      }

      // Generar token aleatorio
      const resetToken = randomBytes(32).toString("hex");
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      // Guardar token en la BD
      await prisma.usuario.update({
        where: { email },
        data: { resetPasswordToken: resetToken, resetPasswordExpires: resetExpires },
      });

      // Enviar email con enlace de reset
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        const resetLink = `https://centrala.up.railway.app/reset-password?token=${resetToken}`;

        await resend.emails.send({
          from: process.env.EMAIL_FROM || "noreply@centrala-pos.com",
          to: email,
          subject: "Recupera tu contraseña en Centrala POS",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #0f172a;">Recupera tu contraseña</h2>
              <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
                Recibimos una solicitud para resetear tu contraseña. Haz clic en el botón de abajo para continuar.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetLink}" style="background: #3B82F6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                  Resetear Contraseña
                </a>
              </div>
              <p style="color: #94a3b8; font-size: 12px;">
                Este enlace expira en 1 hora. Si no solicitaste este reset, ignora este email.
              </p>
            </div>
          `,
        });

        console.log(`✅ Email de reset enviado a ${email}`);
      } catch (emailError: any) {
        console.error("⚠️ Error enviando email de reset:", emailError.message);
      }

      return reply.send({
        success: true,
        message: "Si el email existe, recibirás un enlace para resetear tu contraseña",
      });
    } catch (error: any) {
      console.error("Error en forgot-password:", error);
      return reply.code(500).send({
        error: "Error procesando solicitud",
      });
    }
  });

  // 🔐 POST /auth/reset-password - Resetear contraseña con token
  app.post("/auth/reset-password", async (request, reply) => {
    try {
      const { token, newPassword } = request.body as { token: string; newPassword: string };

      if (!token || !newPassword || newPassword.length < 6) {
        return reply.code(400).send({
          error: "Token y contraseña válidos requeridos",
        });
      }

      // Buscar usuario con token válido
      const usuario = await prisma.usuario.findFirst({
        where: {
          resetPasswordToken: token,
          resetPasswordExpires: { gt: new Date() },
        },
      });

      if (!usuario) {
        return reply.code(401).send({
          error: "Token inválido o expirado",
        });
      }

      // Hashear nueva contraseña
      const passwordHash = await hashPassword(newPassword);

      // Actualizar contraseña y limpiar token
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: {
          passwordHash,
          resetPasswordToken: null,
          resetPasswordExpires: null,
        },
      });

      return reply.send({
        success: true,
        message: "Contraseña reseteada exitosamente",
      });
    } catch (error: any) {
      console.error("Error en reset-password:", error);
      return reply.code(500).send({
        error: "Error reseteando contraseña",
      });
    }
  });

  // 👤 PUT /usuarios/perfil - Actualizar perfil del usuario autenticado
  app.put(
    "/usuarios/perfil",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const { nuevoEmail, nuevaPassword, currentPassword } = request.body as {
          nuevoEmail?: string;
          nuevaPassword?: string;
          currentPassword?: string;
        };

        const usuario = await prisma.usuario.findUnique({
          where: { id: request.user.usuarioId },
        });

        if (!usuario) {
          return reply.code(401).send({ error: "Usuario no encontrado" });
        }

        // Si va a cambiar contraseña, validar la actual
        if (nuevaPassword) {
          if (!currentPassword) {
            return reply.code(400).send({
              error: "Contraseña actual requerida para cambiar contraseña",
            });
          }

          const passwordOk = await verifyPassword(
            currentPassword,
            usuario.passwordHash
          );
          if (!passwordOk) {
            return reply.code(401).send({
              error: "Contraseña actual incorrecta",
            });
          }

          if (nuevaPassword.length < 6) {
            return reply.code(400).send({
              error: "Nueva contraseña debe tener mínimo 6 caracteres",
            });
          }
        }

        // Verificar si el nuevo email ya existe (si es diferente)
        if (nuevoEmail && nuevoEmail !== usuario.email) {
          const existeEmail = await prisma.usuario.findUnique({
            where: { email: nuevoEmail },
          });
          if (existeEmail) {
            return reply.code(409).send({
              error: "El email ya está registrado",
            });
          }
        }

        // Actualizar perfil
        const usuarioActualizado = await prisma.usuario.update({
          where: { id: request.user.usuarioId },
          data: {
            email: nuevoEmail || usuario.email,
            passwordHash: nuevaPassword
              ? await hashPassword(nuevaPassword)
              : usuario.passwordHash,
          },
        });

        return reply.send({
          success: true,
          message: "Perfil actualizado exitosamente",
          usuario: {
            id: usuarioActualizado.id,
            email: usuarioActualizado.email,
            nombre: usuarioActualizado.nombre,
          },
        });
      } catch (error: any) {
        console.error("Error actualizando perfil:", error);
        return reply.code(500).send({
          error: "Error actualizando perfil",
        });
      }
    }
  );

  // TODO: Analytics Dashboard para Super Admin (desactivado temporalmente)
  // Será re-habilitado una vez que la migración de Prisma se ejecute en Railway
  // y los campos zonaHoraria, idioma, dispositivo existan en la BD
  /*
  app.get("/admin/analytics", { preHandler: [app.authenticate] }, async (request, reply) => {
    // ... analytics implementation ...
  });
  */
}
