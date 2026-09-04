import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();
const router = Router();

// 🔐 Middleware: Verificar Super Admin
const verificarSuperAdmin = async (req: Request, res: Response, next: any) => {
  try {
    const usuarioId = (req as any).usuarioId;
    if (!usuarioId) return res.status(401).json({ error: "No autorizado" });

    const usuario = await prisma.usuarios.findUnique({
      where: { id: usuarioId },
    });

    if (!usuario || !usuario.es_super_admin) {
      console.warn(`⚠️ SEGURIDAD: Intento de acceso no autorizado a admin por ${usuario?.email}`);
      return res.status(403).json({ error: "Solo Super Admin puede acceder" });
    }

    (req as any).superAdmin = usuario;
    next();
  } catch (error) {
    res.status(500).json({ error: "Error verificando permisos" });
  }
};

router.use(verificarSuperAdmin);

// 📊 GET /admin/clientes - Listar todos los clientes
router.get("/clientes", async (req: Request, res: Response) => {
  try {
    const clientes = await prisma.empresas.findMany({
      select: {
        id: true,
        nombre: true,
        estado: true,
        tipo_licencia: true,
        dias_restantes: true,
        fecha_vencimiento: true,
        bloqueada_por_admin: true,
        razon_bloqueo: true,
        createdAt: true,
        usuario: {
          select: {
            email: true,
            nombre: true,
          },
          where: { rol: "admin" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const clientesFormateados = clientes.map((c: any) => ({
      id: c.id,
      nombre: c.nombre,
      estado: c.estado,
      tipo_licencia: c.tipo_licencia,
      dias_restantes: c.dias_restantes,
      email_admin: c.usuario?.[0]?.email || "N/A",
      nombre_admin: c.usuario?.[0]?.nombre || "N/A",
      fecha_creacion: c.createdAt,
      fecha_vencimiento: c.fecha_vencimiento,
      bloqueada_por_admin: c.bloqueada_por_admin,
      razon_bloqueo: c.razon_bloqueo,
    }));

    res.json(clientesFormateados);
  } catch (error) {
    console.error("Error listando clientes:", error);
    res.status(500).json({ error: "Error listando clientes" });
  }
});

// ➕ POST /admin/clientes - Crear nuevo cliente (bypass de pago)
router.post("/clientes", async (req: Request, res: Response) => {
  try {
    const { nombreEmpresa, emailAdmin, nombreAdmin, tipoLicencia } = req.body;

    if (!nombreEmpresa || !emailAdmin || !nombreAdmin) {
      return res.status(400).json({ error: "Faltan datos requeridos" });
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
    const empresa = await prisma.empresas.create({
      data: {
        nombre: nombreEmpresa,
        estado: "activa",
        tipo_licencia: tipoLicencia,
        dias_restantes: diasExpiracion,
        fecha_vencimiento: fechaVencimiento,
        bloqueada_por_admin: false,
      },
    });

    // Crear usuario admin para la empresa
    const usuario = await prisma.usuarios.create({
      data: {
        email: emailAdmin,
        nombre: nombreAdmin,
        password_hash: passwordHash,
        empresa_id: empresa.id,
        rol: "admin",
        es_super_admin: false,
      },
    });

    // Registrar en auditoría
    await prisma.admin_auditoria.create({
      data: {
        super_admin_id: (req as any).superAdmin.id,
        accion: "CREAR_CLIENTE",
        entidad: "empresas",
        entidad_id: empresa.id,
        detalles: {
          nombre: nombreEmpresa,
          email_admin: emailAdmin,
          tipo_licencia: tipoLicencia,
        },
      },
    });

    res.json({
      success: true,
      empresa,
      usuario,
      passwordTemporal,
      mensaje: "Cliente creado exitosamente. Contraseña temporal generada.",
    });
  } catch (error) {
    console.error("Error creando cliente:", error);
    res.status(500).json({ error: "Error creando cliente" });
  }
});

// 📅 PATCH /admin/clientes/:id/licencia - Extender licencia
router.patch("/clientes/:id/licencia", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { dias } = req.body;

    if (!dias || dias <= 0) {
      return res.status(400).json({ error: "Días inválido" });
    }

    const empresa = await prisma.empresas.findUnique({ where: { id } });
    if (!empresa) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const nuevaFecha = new Date(
      empresa.fecha_vencimiento!.getTime() + dias * 24 * 60 * 60 * 1000
    );
    const nuevosDias = empresa.dias_restantes + dias;

    const empresaActualizada = await prisma.empresas.update({
      where: { id },
      data: {
        fecha_vencimiento: nuevaFecha,
        dias_restantes: nuevosDias,
      },
    });

    // Auditoría
    await prisma.admin_auditoria.create({
      data: {
        super_admin_id: (req as any).superAdmin.id,
        accion: "EXTENDER_LICENCIA",
        entidad: "empresas",
        entidad_id: id,
        detalles: { dias, nueva_fecha: nuevaFecha },
      },
    });

    res.json({ success: true, empresa: empresaActualizada });
  } catch (error) {
    console.error("Error extendiendo licencia:", error);
    res.status(500).json({ error: "Error extendiendo licencia" });
  }
});

// 🔑 POST /admin/clientes/:id/reset-password - Resetear contraseña
router.post("/clientes/:id/reset-password", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const empresa = await prisma.empresas.findUnique({ where: { id } });
    if (!empresa) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    // Generar nueva contraseña temporal
    const nuevaPassword = `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const passwordHash = await bcrypt.hash(nuevaPassword, 10);

    // Actualizar usuario admin de la empresa
    await prisma.usuarios.updateMany({
      where: { empresa_id: id, rol: "admin" },
      data: { password_hash: passwordHash },
    });

    // Auditoría
    await prisma.admin_auditoria.create({
      data: {
        super_admin_id: (req as any).superAdmin.id,
        accion: "RESET_PASSWORD",
        entidad: "empresas",
        entidad_id: id,
      },
    });

    res.json({
      success: true,
      passwordTemporal: nuevaPassword,
      mensaje: "Contraseña reseteada. Nueva contraseña temporal generada.",
    });
  } catch (error) {
    console.error("Error reseteando password:", error);
    res.status(500).json({ error: "Error reseteando password" });
  }
});

// 🚫 PATCH /admin/clientes/:id/bloquear - Bloquear/Desbloquear cliente
router.patch("/clientes/:id/bloquear", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { bloqueado, razon } = req.body;

    const empresa = await prisma.empresas.update({
      where: { id },
      data: {
        bloqueada_por_admin: bloqueado,
        razon_bloqueo: razon || null,
        fecha_ultimo_bloqueo: bloqueado ? new Date() : null,
      },
    });

    // Auditoría
    await prisma.admin_auditoria.create({
      data: {
        super_admin_id: (req as any).superAdmin.id,
        accion: bloqueado ? "BLOQUEAR_CLIENTE" : "DESBLOQUEAR_CLIENTE",
        entidad: "empresas",
        entidad_id: id,
        detalles: { razon },
      },
    });

    res.json({ success: true, empresa });
  } catch (error) {
    console.error("Error bloqueando cliente:", error);
    res.status(500).json({ error: "Error bloqueando cliente" });
  }
});

// 📋 GET /admin/auditoria - Ver logs de auditoría
router.get("/auditoria", async (req: Request, res: Response) => {
  try {
    const logs = await prisma.admin_auditoria.findMany({
      orderBy: { fecha: "desc" },
      take: 100,
    });

    res.json(logs);
  } catch (error) {
    console.error("Error obteniendo auditoría:", error);
    res.status(500).json({ error: "Error obteniendo auditoría" });
  }
});

export default router;
