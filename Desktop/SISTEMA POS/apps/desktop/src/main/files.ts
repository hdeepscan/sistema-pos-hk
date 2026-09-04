import { dialog, BrowserWindow } from "electron";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Si se pasa "carpeta" (respaldo automatico programado) escribe directo ahi
// sin preguntar. Si no, muestra el dialogo nativo "Guardar como".
export async function guardarArchivo(args: {
  nombreSugerido: string;
  contenidoBase64: string;
  carpeta?: string;
}): Promise<{ guardado: boolean; ruta?: string }> {
  const buffer = Buffer.from(args.contenidoBase64, "base64");

  if (args.carpeta) {
    await mkdir(args.carpeta, { recursive: true });
    const ruta = join(args.carpeta, args.nombreSugerido);
    await writeFile(ruta, buffer);
    return { guardado: true, ruta };
  }

  const win = BrowserWindow.getFocusedWindow();
  const opciones = { defaultPath: args.nombreSugerido };
  const { canceled, filePath } = win
    ? await dialog.showSaveDialog(win, opciones)
    : await dialog.showSaveDialog(opciones);
  if (canceled || !filePath) return { guardado: false };
  await writeFile(filePath, buffer);
  return { guardado: true, ruta: filePath };
}

export async function elegirCarpeta(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow();
  const opciones: Electron.OpenDialogOptions = { properties: ["openDirectory", "createDirectory"] };
  const { canceled, filePaths } = win
    ? await dialog.showOpenDialog(win, opciones)
    : await dialog.showOpenDialog(opciones);
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
}

export async function elegirArchivo(
  filtros?: { name: string; extensions: string[] }[]
): Promise<{ ruta: string; contenidoBase64: string } | null> {
  const win = BrowserWindow.getFocusedWindow();
  const opciones: Electron.OpenDialogOptions = { properties: ["openFile"], filters: filtros };
  const { canceled, filePaths } = win
    ? await dialog.showOpenDialog(win, opciones)
    : await dialog.showOpenDialog(opciones);
  if (canceled || filePaths.length === 0) return null;
  const contenido = await readFile(filePaths[0]);
  return { ruta: filePaths[0], contenidoBase64: contenido.toString("base64") };
}
