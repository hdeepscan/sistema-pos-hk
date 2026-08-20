export interface ColumnaImport<T = any> {
  encabezado: string; // Nombre exacto en el CSV
  clave: keyof T & string; // Campo en el objeto T
  tipo?: "string" | "number" | "boolean"; // Tipo de conversión
  requerido?: boolean; // Si la columna es obligatoria
  validar?: (valor: any) => boolean; // Función de validación personalizada
}

function parseValue(valor: string, tipo?: string): any {
  valor = valor.trim();
  if (!valor) return null;

  switch (tipo) {
    case "number":
      const num = Number(valor);
      return isNaN(num) ? null : num;
    case "boolean":
      return valor.toLowerCase() === "true" || valor === "1" || valor === "sí" || valor === "si";
    case "string":
    default:
      return valor;
  }
}

export async function importarCSV<T>(archivo: File, columnas: ColumnaImport<T>[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const contenido = e.target?.result as string;
        const lineas = contenido.split("\n").map((l) => l.trim()).filter((l) => l);

        if (lineas.length < 2) {
          reject(new Error("El archivo CSV está vacío o sin datos"));
          return;
        }

        // Parsear encabezados
        const encabezados = parsearLineCsv(lineas[0]);
        const indicesColumnas = new Map<string, number>();

        for (const col of columnas) {
          const indice = encabezados.indexOf(col.encabezado);
          if (indice === -1 && col.requerido !== false) {
            console.warn(`Columna opcional "${col.encabezado}" no encontrada`);
          }
          if (indice !== -1) {
            indicesColumnas.set(col.clave, indice);
          }
        }

        // Parsear filas de datos
        const filas: T[] = [];
        for (let i = 1; i < lineas.length; i++) {
          const valores = parsearLineCsv(lineas[i]);
          if (valores.length === 0) continue; // Saltar líneas vacías

          const fila: Record<string, any> = {};
          let filaValida = true;

          for (const col of columnas) {
            const indice = indicesColumnas.get(col.clave);
            if (indice === undefined) {
              if (col.requerido) {
                console.warn(`Columna requerida "${col.encabezado}" no encontrada en fila ${i}`);
                filaValida = false;
              }
              continue;
            }

            const valor = valores[indice] || "";
            const parseado = parseValue(valor, col.tipo);

            // Validar
            if (col.requerido && !parseado) {
              console.warn(`Valor requerido faltante en "${col.encabezado}" (fila ${i})`);
              filaValida = false;
            }

            if (col.validar && parseado !== null && !col.validar(parseado)) {
              console.warn(`Validación fallida en "${col.encabezado}" (fila ${i}): ${valor}`);
              filaValida = false;
            }

            fila[col.clave] = parseado;
          }

          if (filaValida) {
            filas.push(fila as T);
          }
        }

        if (filas.length === 0) {
          reject(new Error("No se encontraron filas válidas en el CSV"));
          return;
        }

        resolve(filas);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error("Error leyendo el archivo"));
    };

    reader.readAsText(archivo, "utf-8");
  });
}

// Parsea una línea CSV respetando comillas y escape de caracteres
function parsearLineCsv(linea: string): string[] {
  const valores: string[] = [];
  let valorActual = "";
  let dentroComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const char = linea[i];
    const nextChar = linea[i + 1];

    if (char === '"') {
      if (dentroComillas && nextChar === '"') {
        // Escape: "" = "
        valorActual += '"';
        i++; // Saltar el siguiente "
      } else {
        // Alternar estado de comillas
        dentroComillas = !dentroComillas;
      }
    } else if (char === "," && !dentroComillas) {
      // Fin de valor
      valores.push(valorActual);
      valorActual = "";
    } else {
      valorActual += char;
    }
  }

  // Agregar el último valor
  valores.push(valorActual);

  return valores.map((v) => v.trim());
}
