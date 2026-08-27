import { PrismaClient, EstadoLicencia } from "@prisma/client";

const prisma = new PrismaClient();

export interface ValidacionLicencia {
  valida: boolean;
  razon?: string;
  licencia?: any;
  suscripcion?: any;
}

export interface InfoLicencia {
  empresaId: string;
  estado: EstadoLicencia;
  usuariosIncluidos: number;
  usuariosActuales: number;
  fechaVencimiento: Date;
  diasRestantes: number;
  activa: boolean;
  tipoPlan?: string;
}

/**
 * Validar si la licencia de una empresa es válida
 */
export async function validarLicencia(empresaId: string): Promise<ValidacionLicencia> {
  try {
    const licencia = await prisma.licencia.findUnique({
      where: { empresaId },
      include: { suscripcion: true },
    });

    if (!licencia) {
      return {
        valida: false,
        razon: "Licencia no encontrada",
      };
    }

    // Verificar estado
    if (licencia.estado === "CANCELADA") {
      return {
        valida: false,
        razon: "Licencia cancelada",
        licencia,
      };
    }

    if (licencia.estado === "SUSPENDIDA") {
      return {
        valida: false,
        razon: "Licencia suspendida",
        licencia,
      };
    }

    // Verificar vencimiento
    const ahora = new Date();
    if (licencia.fechaVencimiento < ahora && licencia.estado !== "PRUEBA") {
      // Actualizar estado si está vencida
      await prisma.licencia.update({
        where: { empresaId },
        data: { estado: "VENCIDA" },
      });

      return {
        valida: false,
        razon: "Licencia vencida",
        licencia,
      };
    }

    return {
      valida: true,
      licencia,
      suscripcion: licencia.suscripcion,
    };
  } catch (error) {
    console.error("Error validando licencia:", error);
    return {
      valida: false,
      razon: "Error al validar licencia",
    };
  }
}

/**
 * Obtener información de licencia
 */
export async function obtenerInfoLicencia(empresaId: string): Promise<InfoLicencia | null> {
  try {
    const licencia = await prisma.licencia.findUnique({
      where: { empresaId },
      include: { suscripcion: true },
    });

    if (!licencia) return null;

    const ahora = new Date();
    const diasRestantes = Math.ceil(
      (licencia.fechaVencimiento.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      empresaId,
      estado: licencia.estado,
      usuariosIncluidos: licencia.usuariosIncluidos,
      usuariosActuales: licencia.usuariosActuales,
      fechaVencimiento: licencia.fechaVencimiento,
      diasRestantes,
      activa: licencia.estado === "ACTIVA" && diasRestantes > 0,
      tipoPlan: licencia.suscripcion?.tipoPlan,
    };
  } catch (error) {
    console.error("Error obteniendo info de licencia:", error);
    return null;
  }
}

/**
 * Verificar si empresa puede agregar más usuarios
 */
export async function puedeAgregarUsuarios(empresaId: string, cantidad: number = 1): Promise<boolean> {
  try {
    const licencia = await prisma.licencia.findUnique({
      where: { empresaId },
    });

    if (!licencia) return false;

    const disponibles = licencia.usuariosIncluidos - licencia.usuariosActuales;
    return disponibles >= cantidad;
  } catch (error) {
    console.error("Error verificando usuarios:", error);
    return false;
  }
}

/**
 * Crear licencia trial para nueva empresa
 */
export async function crearLicenciaTrial(empresaId: string): Promise<any> {
  try {
    // Crear licencia trial por 14 días
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + 14);

    const licencia = await prisma.licencia.create({
      data: {
        empresaId,
        estado: "PRUEBA",
        usuariosIncluidos: 2,
        usuariosActuales: 1,
        fechaVencimiento,
      },
    });

    return licencia;
  } catch (error) {
    console.error("Error creando licencia trial:", error);
    throw error;
  }
}

/**
 * Crear licencia pagada
 */
export async function crearLicenciaPagada(
  empresaId: string,
  tipoPlan: "MENSUAL" | "TRIMESTRAL" | "ANUAL",
  usuariosAdicionales: number = 0
): Promise<any> {
  try {
    // Obtener precios
    const precioPlan = await prisma.precioPlan.findUnique({
      where: { tipoPlan },
    });

    if (!precioPlan) {
      throw new Error(`Plan ${tipoPlan} no encontrado`);
    }

    // Calcular fecha de vencimiento
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + precioPlan.diasDuracion);

    // Eliminar licencia anterior si existe
    await prisma.licencia.deleteMany({
      where: { empresaId },
    });

    // Crear nueva licencia
    const licencia = await prisma.licencia.create({
      data: {
        empresaId,
        estado: "ACTIVA",
        usuariosIncluidos: 2 + usuariosAdicionales,
        usuariosActuales: 1,
        fechaVencimiento,
      },
    });

    // Crear suscripción
    const precioTotal = precioPlan.precioFinal + (usuariosAdicionales * precioPlan.precioXUsuarioAdicional);

    const suscripcion = await prisma.suscripcion.create({
      data: {
        licenciaId: licencia.id,
        tipoPlan,
        precioBase: precioPlan.precioFinal,
        precioTotal,
        fechaProxiamRenovacion: fechaVencimiento,
        activa: true,
        renovacionAutomatica: true,
      },
    });

    return { licencia, suscripcion };
  } catch (error) {
    console.error("Error creando licencia pagada:", error);
    throw error;
  }
}

/**
 * Actualizar contador de usuarios actuales
 */
export async function actualizarUsuariosActuales(empresaId: string, cantidad: number): Promise<any> {
  try {
    const licencia = await prisma.licencia.update({
      where: { empresaId },
      data: { usuariosActuales: cantidad },
    });

    return licencia;
  } catch (error) {
    console.error("Error actualizando usuarios:", error);
    throw error;
  }
}

/**
 * Registrar pago
 */
export async function registrarPago(datos: {
  empresaId: string;
  referenciaPago: string;
  monto: number;
  tipoPlan: "MENSUAL" | "TRIMESTRAL" | "ANUAL";
  usuariosAdicionales?: number;
  transaccionId?: string;
}): Promise<any> {
  try {
    const pago = await prisma.pago.create({
      data: {
        empresaId: datos.empresaId,
        referenciaPago: datos.referenciaPago,
        estado: "COMPLETADO",
        monto: datos.monto,
        tipoPlan: datos.tipoPlan,
        usuariosAdicionales: datos.usuariosAdicionales || 0,
        transaccionId: datos.transaccionId,
        fechaPago: new Date(),
      },
    });

    // Crear/Actualizar licencia
    await crearLicenciaPagada(
      datos.empresaId,
      datos.tipoPlan,
      datos.usuariosAdicionales || 0
    );

    return pago;
  } catch (error) {
    console.error("Error registrando pago:", error);
    throw error;
  }
}
