export const MAX_ATTACHMENTS = 5
// requests go through Vercel's proxy, which caps bodies at ~4.5 MB, and
// base64 adds a third on top - so keep the files themselves under 3 MB
export const MAX_ATTACHMENT_TOTAL_BYTES = 3 * 1024 * 1024

export const ATTACHMENT_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,' +
  '.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel'

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export const isImage = (type: string) => /^image\/(png|jpe?g|gif|webp)$/.test(type)
