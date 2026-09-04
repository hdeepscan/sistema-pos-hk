# Guía: Importar Productos desde CSV

## ¿Cómo funciona?

La función de importación lee un archivo CSV y:
- **Crea** nuevos productos si el SKU no existe
- **Actualiza** productos existentes si el SKU ya está en el sistema
- Solo requiere **SKU** y **Nombre** (otros campos son opcionales)

## Formato del CSV

El archivo debe tener estos encabezados en la primera fila:

```csv
SKU,Producto,Categoria,Precio,Costo,Codigo de barras
```

### Campos requeridos
- **SKU**: Identificador único del producto (ej: `CAMISETA-001`)
- **Producto**: Nombre del producto (ej: `Camiseta Azul`)

### Campos opcionales
- **Categoria**: Clasificación del producto (ej: `Ropa`)
- **Precio**: Precio de venta (número, ej: `29.99`)
- **Costo**: Costo del producto (número, ej: `12.50`)
- **Codigo de barras**: Código de barras EAN/UPC (ej: `7501234567890`)

## Ejemplos de CSV

### Ejemplo 1: Productos simples
```csv
SKU,Producto,Categoria,Precio,Costo,Codigo de barras
CAMISETA-001,Camiseta Azul,Ropa,29.99,12.50,7501234567890
CAMISETA-002,Camiseta Roja,Ropa,29.99,12.50,7501234567891
PANTALON-001,Pantalón Negro,Ropa,59.99,25.00,7501234567892
```

### Ejemplo 2: Mínimo requerido
Solo necesitas SKU y nombre del producto:
```csv
SKU,Producto
PROD-001,Producto 1
PROD-002,Producto 2
PROD-003,Producto 3
```

### Ejemplo 3: Actualizar productos existentes
Si un SKU ya existe en tu sistema, se actualizarán los datos:
```csv
SKU,Producto,Categoria,Precio,Costo,Codigo de barras
CAMISETA-001,Camiseta Azul - Edición Especial,Ropa,34.99,14.00,7501234567890
```

## Cómo usar en la aplicación

1. **Desde la pantalla de Productos**
   - Click en el botón "**Importar CSV**"
   - Selecciona tu archivo CSV desde tu computadora
   - Revisa la lista de productos a importar
   - Click en "**Confirmar importación**"
   - La aplicación te mostrará cuántos productos se crearon/actualizaron

2. **Requisitos de la aplicación**
   - Debes estar autenticado en el sistema
   - Los productos se importarán para tu empresa actual
   - Se crearán automáticamente en todas las sucursales con stock = 0

## Manejo de errores

Si el CSV tiene problemas:
- **Falta SKU o Nombre**: La fila se ignora
- **Precio o Costo no son números**: Se asigna 0 o se ignora
- **Código de barras inválido**: Se guarda como texto
- **CSV vacío o sin encabezados**: Se muestra un error

La importación continúa incluso si hay errores en algunas filas. Te mostrará:
- ✓ Productos creados
- ✓ Productos actualizados  
- ✕ Errores encontrados

## Exportar y luego importar

Puedes usar la función de exportación para:
1. Exportar todos tus productos a CSV
2. Modificar el archivo en Excel/Google Sheets
3. Importar nuevamente para actualizar en lote

## Tips

- **Headers exactos**: Los encabezados en tu CSV deben coincidir exactamente (mayúsculas no importan, pero espacios sí)
- **Caracteres especiales**: El CSV debe estar en formato UTF-8
- **Comillas en valores**: Si un campo tiene comas o saltos de línea, envuélvelo en comillas: `"Producto, versión 1"`
- **Espacios**: Se trimean automáticamente al inicio y final
- **Números**: Usa punto (.) no coma (,) para decimales: `29.99` no `29,99`

## Ejemplo completo con Excel

1. Abre Excel o Google Sheets
2. Crea una tabla con las columnas: SKU, Producto, Categoria, Precio, Costo, Codigo de barras
3. Completa tus productos
4. Guarda como CSV (Archivo → Descargar como → CSV)
5. En el sistema: Importar CSV → Selecciona el archivo
6. ¡Listo! Tus productos se crearán/actualizarán automáticamente
