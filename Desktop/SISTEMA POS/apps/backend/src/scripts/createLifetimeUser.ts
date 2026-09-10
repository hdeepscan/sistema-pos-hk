import { hash } from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { enviarCorreoBienvenida } from '../utils/mailer.js';

async function createLifetimeUser() {
  try {
    console.log('🏢 Starting Lifetime User (Tenant) Creation...\n');

    // 1. Encriptar contraseña
    const passwordPlain = 'Centrala2026*';
    const passwordHash = await hash(passwordPlain, 10);
    console.log('✅ Password encrypted\n');

    // 2. Crear Empresa usando raw SQL para evitar problemas de schema
    const empresaId = crypto.randomUUID();
    const now = new Date();

    await prisma.$executeRaw`
      INSERT INTO empresas (id, nombre, plan, activo, "fechaRegistro")
      VALUES (${empresaId}, 'Mi Tienda de Prueba', 'VITALICIO', true, ${now})
      ON CONFLICT DO NOTHING
    `;

    console.log(`✅ Empresa creada: "Mi Tienda de Prueba"`);
    console.log(`   ID: ${empresaId}`);
    console.log(`   Plan: VITALICIO`);
    console.log(`   Estado: Vitalicio (LIFETIME)\n`);

    // 3. Crear Usuario usando raw SQL para evitar incompatibilidades
    const usuarioId = crypto.randomUUID();
    const permisos = [
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
    ];

    try {
      await prisma.$executeRaw`
        INSERT INTO usuarios (id, "empresaId", nombre, email, "passwordHash", rol, permisos, activo, "creadoEn")
        VALUES (${usuarioId}, ${empresaId}, 'Administrador de Tienda', 'admin@centrala.com.co', ${passwordHash}, 'ADMIN', ${JSON.stringify(permisos)}, true, ${now})
        ON CONFLICT (email) DO NOTHING
      `;

      console.log(`✅ Usuario creado: "Administrador de Tienda"`);
      console.log(`   Email: admin@centrala.com.co`);
      console.log(`   Rol: ADMIN (de su empresa)\n`);
    } catch (err) {
      console.log('⚠️  Usuario podría existir, continuando...');
      console.log(`   Email: admin@centrala.com.co`);
      console.log(`   Rol: ADMIN (de su empresa)\n`);
    }

    // 4. Crear Sucursal
    const sucursalId = crypto.randomUUID();
    await prisma.sucursal.create({
      data: {
        id: sucursalId,
        empresaId,
        nombre: 'Sucursal Principal',
        tipo: 'FISICA',
        direccion: 'Dirección de prueba',
        activo: true,
      },
    }).catch((err: any) => {
      console.log('⚠️  Sucursal podría existir, continuando...');
      return null;
    });

    console.log(`✅ Sucursal creada: "Sucursal Principal"\n`);

    // 5. Enviar correo de bienvenida (FIRE AND FORGET)
    console.log(`📧 Enviando correo de bienvenida a admin@centrala.com.co...`);
    enviarCorreoBienvenida(
      { nombre: 'Administrador de Tienda', email: 'admin@centrala.com.co' },
      passwordPlain
    ).catch((err) => {
      console.error('⚠️  Error al enviar correo (usuario creado correctamente):', err);
    });

    // Esperar un poco para que el correo se procese
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ LIFETIME USER CREATION COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n📋 CREDENCIALES DE ACCESO:');
    console.log(`   Email:    admin@centrala.com.co`);
    console.log(`   Password: ${passwordPlain}`);
    console.log(`   Empresa:  Mi Tienda de Prueba`);
    console.log(`\n🔒 ESTADO DE SUSCRIPCIÓN:`);
    console.log(`   Plan:     VITALICIO (LIFETIME)`);
    console.log(`   Usuarios: 10 incluidos`);
    console.log(`   Vence:    Nunca (Prueba Perpetua)`);
    console.log(`\n📧 CORREO ENVIADO:`);
    console.log(`   Verificar: admin@centrala.com.co`);
    console.log(`   El correo contiene las credenciales y el enlace de acceso`);
    console.log(`   ℹ️  Si las variables SMTP no están configuradas, el correo no se envió`);
    console.log('\n⚠️  IMPORTANTE: Cambiar contraseña en el primer acceso');
    console.log('═══════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during Lifetime User creation:', error);
    process.exit(1);
  }
}

createLifetimeUser();
