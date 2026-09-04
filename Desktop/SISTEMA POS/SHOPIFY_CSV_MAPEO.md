# Importar CSV desde Shopify

## ✅ Ahora soportamos exportes de Shopify directamente

Ya no necesitas reformatear el CSV de Shopify. El sistema detecta automáticamente las columnas.

## Mapeo de columnas Shopify → Sistema POS

| Sistema POS | Columnas Shopify (detectadas automáticamente) |
|-------------|----------------------------------------------|
| **SKU** | `Variant SKU` |
| **Producto** | `Title` |
| **Categoría** | `Product Category` o `Type` |
| **Precio** | `Variant Price` |
| **Costo** | `Cost per item` |
| **Código de barras** | `Variant Barcode` |

## ¿Cómo usar?

### Opción 1: Exportar desde Shopify Admin

1. **Shopify Admin** → Productos
2. Click en **...** (más opciones) → **Exportar**
3. Selecciona **Todos los productos** o los que quieras
4. Click en **Exportar productos**
5. Se descarga un CSV como: `products_export_1.csv`

### Opción 2: Importar en Sistema POS

1. Abre **Productos** en tu POS
2. Click en **Importar CSV**
3. Selecciona tu archivo CSV de Shopify
4. El sistema **automáticamente mapea** las columnas
5. Revisa el preview y confirma
6. ✓ Tus productos se crean/actualizan

## Qué sucede

- ✅ **Nuevos SKUs**: Se crean como nuevos productos
- ✅ **SKUs existentes**: Se actualizan los datos
- ⚠️ **Cambios detectados**: En el preview verás exactamente qué se importará

## Ejemplo de columnas detectadas

Si tu Shopify CSV tiene:
```
Handle,Title,Vendor,Variant SKU,Variant Price,Cost per item,Variant Barcode,...
locion-valcris,LOCION VALCRIS,Valcris Store,LOC-VAL-001,99000.00,45000.00,7501234567890,...
```

El sistema entiende:
- Title → **Nombre del producto** 
- Variant SKU → **SKU**
- Variant Price → **Precio**
- Cost per item → **Costo**
- Variant Barcode → **Código de barras**

## Formatos soportados

El sistema ahora soporta:

### 1️⃣ Formato Shopify (recomendado)
```csv
Title,Variant SKU,Variant Price,Cost per item,Variant Barcode,Product Category
Mi Producto,PROD-001,29.99,12.50,7501234567890,Ropa
```

### 2️⃣ Formato Sistema POS
```csv
Producto,SKU,Precio,Costo,Codigo de barras,Categoria
Mi Producto,PROD-001,29.99,12.50,7501234567890,Ropa
```

### 3️⃣ Formatos mezclados (también funciona)
```csv
Title,SKU,Precio,Cost per item,Barcode
Mi Producto,PROD-001,29.99,12.50,7501234567890
```

## Errores comunes

❌ **Error: "Columna requerida SKU no encontrada"**
- Asegúrate de que tu CSV tenga una columna SKU (en Shopify es "Variant SKU")
- Revisa que el CSV no esté vacío

❌ **Error: "Columna requerida Producto no encontrada"**
- Tu CSV debe tener el nombre del producto (en Shopify es "Title")

✅ **Los precios salen en 0**
- Verifica que en tu Shopify CSV la columna "Variant Price" tenga valores numéricos
- El separador debe ser punto (.) no coma (,)

## Tips

- **Descarga completa**: Es más seguro exportar todos los productos desde Shopify, no solo los activos
- **Código de barras**: Si Shopify no tiene codes de barras, simplemente no se importan
- **Categorías**: Si no tienes categorías en Shopify, se quedan vacías (opcional)
- **Imágenes**: El CSV no incluye imágenes. Tendrás que subirlas por separado en cada producto

## ¿Necesitas ayuda?

Si tu CSV tiene un formato diferente:
1. Abre el CSV en Excel/Google Sheets
2. Asegúrate de tener estas columnas (con estos EXACTOS nombres):
   - `SKU` (o `Variant SKU`)
   - `Producto` (o `Title`)
   - `Precio` (o `Variant Price`) - opcional
   - `Costo` (o `Cost per item`) - opcional
   - `Codigo de barras` (o `Variant Barcode`) - opcional
   - `Categoria` (o `Product Category`) - opcional
3. Guarda como CSV y carga nuevamente
