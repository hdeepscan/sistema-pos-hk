# CENTRALA TYPOGRAPHY SYSTEM

## Familias Tipográficas

### **Montserrat**
- **Uso**: Títulos, encabezados, botones, KPIs
- **Pesos**: 500, 600, 700
- **Propósito**: Comunicación, presencia, jerarquía
- **Sentimiento**: Profesional, moderno, fuerte

### **Inter**
- **Uso**: Texto body, datos, tablas, formularios, labels
- **Pesos**: 400, 500, 600, 700
- **Propósito**: Lectura, información, precisión
- **Sentimiento**: Legible, limpio, accesible

---

## Escala Tipográfica

| Elemento | Fuente | Tamaño | Peso | Línea | Uso |
|----------|--------|--------|------|-------|-----|
| **H1** | Montserrat | 28px | 700 | 1.35 | Títulos principales |
| **H2** | Montserrat | 20px | 600 | 1.4 | Encabezados de sección |
| **H3** | Montserrat | 16px | 600 | 1.5 | Subtítulos |
| **Body** | Inter | 14px | 400 | 1.5 | Texto general |
| **Body LG** | Inter | 16px | 400 | 1.6 | Descripciones largas |
| **Body SM** | Inter | 13px | 400 | 1.5 | Texto secundario |
| **Data** | Inter | 14px | 500 | 1.5 | Números, valores |
| **Data LG** | Inter | 16px | 600 | 1.5 | Números destacados |
| **KPI** | Montserrat | 32px | 700 | 1.2 | Números financieros grandes |
| **Label** | Inter | 12px | 500 | 1.4 | Nombres de campos |
| **Button** | Montserrat | 14px | 600 | 1.4 | Texto de botones |
| **XS** | Inter | 12px | 400 | 1.4 | Texto muy pequeño |
| **Caption** | Inter | 11px | 400 | 1.4 | Descripciones mínimas |

---

## Guía de Uso

### **Montserrat (Títulos & Botones)**

```tsx
// H1 - Título Principal
<h1 className="h1">Resumen Financiero</h1>

// H2 - Encabezado de Sección
<h2 className="h2">Flujo de Caja</h2>

// H3 - Subtítulo
<h3 className="h3">Ingresos vs. Gastos</h3>

// Button
<button className="button">Guardar</button>

// KPI
<div className="kpi">$125.480.000</div>
```

### **Inter (Texto & Datos)**

```tsx
// Body Text
<p className="body">Consulta el comportamiento financiero...</p>

// Body Large
<p className="body-lg">Descripción más detallada del concepto</p>

// Data Values
<div className="data">$18.450.000</div>

// Label
<label className="label">TOTAL DE INGRESOS</label>

// Small Text
<p className="text-xs">Información adicional</p>
```

---

## Variables CSS

Todas las propiedades tipográficas están disponibles como variables CSS en `:root`:

```css
/* Fonts */
--font-heading: "Montserrat", sans-serif;
--font-body: "Inter", sans-serif;

/* Font Weights */
--font-weight-regular: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;

/* Tamaños & Pesos */
--text-h1-size: 28px;
--text-h1-weight: 700;
--text-h1-line-height: 1.35;

/* ... y más (ver styles/typography.css) */
```

---

## Responsive Behavior

### Desktop (1024px+)
- H1: 28px
- H2: 20px
- H3: 16px
- Body: 14px
- KPI: 32px

### Tablet (769px - 1023px)
- H1: 24px
- H2: 18px
- H3: 15px
- Body: 13px
- KPI: 28px

### Mobile (< 768px)
- H1: 22px
- H2: 16px
- H3: 14px
- Body: 12px
- KPI: 24px

---

## Reglas de Oro

1. **Títulos = Montserrat**
   - Usa Montserrat SOLO para títulos, encabezados y botones
   - NO para párrafos de texto

2. **Datos Financieros = Inter Medium/Semibold**
   - Números y valores siempre en Inter
   - Usa weight 500+ para destacar
   - Los KPIs grandes pueden ser Montserrat 700

3. **Consistencia de Peso**
   - Body text: siempre 400
   - Labels: siempre 500
   - Títulos: siempre 600-700
   - Botones: siempre 600

4. **Line Height**
   - Montserrat: 1.2 - 1.4
   - Inter: 1.4 - 1.6
   - Datos: 1.5 (para legibilidad)

5. **No Mezcles Excesivamente**
   - Máximo 3 tamaños diferentes por pantalla
   - Jerarquía clara H1 > H2 > H3 > Body

---

## Importación en Componentes

```tsx
// Ya está incluido en main.tsx
// No necesitas importar nada más

// Usa directamente las clases:
<h1 className="h1">Título</h1>
<p className="body">Texto</p>
<div className="data">$1,000</div>
```

---

## Migration Checklist

- [x] Google Fonts (Montserrat + Inter) agregadas
- [x] CSS de tipografía global creado
- [x] Variables CSS definidas
- [x] Classes CSS para cada elemento tipográfico
- [x] Login.tsx actualizado
- [x] Layout.tsx actualizado
- [ ] Dashboard componentes (próximo)
- [ ] Tablas de datos (próximo)
- [ ] Forms (próximo)
- [ ] PDFs/Recibos (próximo)

---

## Notas

- Las tipografías se cargan desde Google Fonts con preconnect para mejor rendimiento
- Sistema completamente responsive
- Compatible con Electron (local fonts fallback)
- Diseñado específicamente para ERP financiero

