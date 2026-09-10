import { hash } from 'bcrypt';
import { prisma } from '../lib/prisma.js';

/**
 * Script para recrear/actualizar el usuario de prueba
 * En caso de que el password sea incorrecto o el usuario no exista
 */

async function resetTestUser() {
  try {
    console.log('🔧 Reseteando usuario de prueba...\n');

    const email = 'admin@centrala.com.co';
    const passwordPlain = 'Centrala2026*';
    const passwordHash = await hash(passwordPlain, 10);

    // 1. Buscar o crear empresa
    let empresa = await prisma.empresa.findFirst({
      where: { nombre: 'Mi Tienda de Prueba' },
    });

    if (!empresa) {
      empresa = await prisma.empresa.create({
        data: {
          nombre: 'Mi Tienda de Prueba',
          plan: 'VITALICIO',
          activo: true,
        },
      });
      console.log('✅ Empresa creada: Mi Tienda de Prueba');
    } else {
      console.log('✅ Empresa encontrada: Mi Tienda de Prueba');
    }

    // 2. Buscar usuario existente
    let usuario = await prisma.usuario.findUnique({
      where: { email },
    });

    if (usuario) {
      // Actualizar contraseña si existe
      usuario = await prisma.usuario.update({
        where: { id: usuario.id },
        data: {
          passwordHash,
          activo: true,
          rol: 'ADMIN',
        },
      });
      console.log(`✅ Usuario actualizado: ${email}`);
      console.log(`   Nueva contraseña: ${passwordPlain}`);
    } else {
      // Crear usuario si no existe
      usuario = await prisma.usuario.create({
        data: {
          empresaId: empresa.id,
          nombre: 'Admin Tienda de Prueba',
          email,
          passwordHash,
          rol: 'ADMIN',
          activo: true,
          permisos: [
            'usuarios.crear',
            'usuarios.editar',
            'usuarios.eliminar',
            'productos.administrar',
            'ventas.crear',
            'ventas.editar',
            'reportes.ver',
            'gastos.administrar',
            'caja.abrir',
            'caja.cerrar',
            'clientes.administrar',
            'proveedores.administrar',
            'compras.crear',
          ],
        },
      });
      console.log(`✅ Usuario creado: ${email}`);
      console.log(`   Contraseña: ${passwordPlain}`);
    }

    // 3. Verificar
    const test = await prisma.usuario.findUnique({
      where: { email },
      include: { empresa: true },
    });

    if (test) {
      console.log('\n✅ VERIFICACIÓN EXITOSA:');
      console.log(`   Email: ${test.email}`);
      console.log(`   Empresa: ${test.empresa.nombre}`);
      console.log(`   Rol: ${test.rol}`);
      console.log(`   Activo: ${test.activo}`);
      console.log(`\n🔓 Credenciales de acceso:`);
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${passwordPlain}\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resetTestUser();
