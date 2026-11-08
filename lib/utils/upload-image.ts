// Shrinks a photo in the browser (max 1200 px, JPEG) and uploads it to a public bucket.
export async function compressImage(file: File, max = 1200, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', quality))
}

/** Returns the public URL, or throws with a readable message. */
export async function uploadPublicImage(supabase: any, bucket: string, folder: string, file: File): Promise<string> {
  const blob = await compressImage(file)
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(/bucket|not found/i.test(error.message) ? 'Falta aplicar la migración 008 (almacenamiento de fotos).' : error.message)
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl as string
}
